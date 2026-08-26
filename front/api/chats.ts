import { request, PaginatedResponse } from './request';
import { UnauthorizedError, refreshWithRefreshToken } from './apiClient';
import { getTokens, TokenData } from './tokens';

export type { PaginatedResponse };

export interface Chat {
    id: number;
    chat_id: string;
    title: string;
    modified_at: string;
    messages: ChatMessage[];
    profile: {
        profile_id: string;
    }, 
    bot: {
        name: string;
        bot_id: string;
    }
}

// Agent activity chips rendered inside an assistant bubble (roadmap doc 06).
export type AgentActivity =
    | { kind: 'tool_start'; label: string }
    | { kind: 'sources'; label: string }
    | { kind: 'deck'; deckId: string; name: string; cardCount: number };

export interface ChatMessage {
    text: string;
    image_url: string | null;
    role: string;
    isLoading?: boolean | undefined;
    /** Send failed — the bubble offers a Retry action. */
    failed?: boolean;
    /** Tool activity (searching… / creating flashcards…) for this turn. */
    agentEvents?: AgentActivity[];
}

export const fetchChat = async (chatId: string): Promise<Chat | null> =>
    request<Chat | null>(`/chats/${chatId}.json`, {}, null);

export const fetchChats = async (profileId: string | null, page: number | null): Promise<PaginatedResponse<Chat> | null> => {
    let endpoint = '/chats.json?1=1';
    if (profileId) {
        endpoint += '&profileId=' + profileId;
    }
    if (page) {
        endpoint += `&page=${page}`;
    }
    return request<PaginatedResponse<Chat> | null>(endpoint, {}, { results: [], count: 0 });
};


export const fetchChatMessages = async (chatId: string, page: number | null): Promise<PaginatedResponse<ChatMessage> | null> => {
    let endpoint = `/chats/${chatId}/messages.json`;
    if (page) {
        endpoint += `?page=${page}`;
    }
    return request<PaginatedResponse<ChatMessage> | null>(endpoint, {}, { results: [], count: 0 });
}

export interface ChatResponse {
    chat_id: string;
    response: string;
}

export const sendChat = async (
    chatId: string = "new", 
    message: FormData,
): Promise<ChatResponse | null> =>
    request<ChatResponse | null>(`/chats/${chatId}`, {
        method: 'POST',
        body: message,
    }, null);

// ---------------------------------------------------------------------------
// Streaming (roadmap doc 06 §1 frontend)
// ---------------------------------------------------------------------------

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export interface ChatStreamEvent {
    type: 'meta' | 'token' | 'tool_start' | 'tool_end' | 'done' | 'error';
    chatId?: string;
    messageId?: string;
    text?: string;
    tool?: string;
    resultPreview?: string;
    deckId?: string;
    name?: string;
    cardCount?: number;
    inputTokens?: number;
    outputTokens?: number;
    code?: string;
    message?: string;
}

/**
 * Incremental SSE frame parser. Frames are `event: <name>` + one or more
 * `data: <json>` lines terminated by a blank line. push() can be fed arbitrary
 * chunk boundaries; flush() emits any trailing partial frame.
 */
export function createSseParser(onFrame: (eventType: string, data: string) => void) {
    let buffer = '';
    const processBlock = (block: string) => {
        let eventType = 'message';
        const dataLines: string[] = [];
        for (const line of block.split('\n')) {
            if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trimStart());
            }
        }
        if (eventType !== 'message' && dataLines.length > 0) {
            onFrame(eventType, dataLines.join('\n'));
        }
    };
    return {
        push(chunk: string) {
            buffer += chunk.replace(/\r\n/g, '\n');
            let separator = buffer.indexOf('\n\n');
            while (separator !== -1) {
                processBlock(buffer.slice(0, separator));
                buffer = buffer.slice(separator + 2);
                separator = buffer.indexOf('\n\n');
            }
        },
        flush() {
            if (buffer.trim()) {
                processBlock(buffer);
                buffer = '';
            }
        },
    };
}

/** Map a raw SSE frame to a normalized ChatStreamEvent. Unknown frames -> null. */
export function normalizeStreamEvent(eventType: string, dataJson: string): ChatStreamEvent | null {
    let data: Record<string, unknown>;
    try {
        data = JSON.parse(dataJson);
    } catch {
        return null;
    }
    switch (eventType) {
        case 'meta':
            return { type: 'meta', chatId: data.chat_id as string, messageId: data.message_id as string };
        case 'token':
            return typeof data.text === 'string' ? { type: 'token', text: data.text } : null;
        case 'status':
            if (data.type === 'tool_start') {
                return { type: 'tool_start', tool: (data.tool as string) ?? '' };
            }
            if (data.type === 'tool_end') {
                return {
                    type: 'tool_end',
                    tool: (data.tool as string) ?? '',
                    resultPreview: data.result_preview as string | undefined,
                    deckId: data.deck_id as string | undefined,
                    name: data.name as string | undefined,
                    cardCount: data.card_count as number | undefined,
                };
            }
            return null;
        case 'done':
            return {
                type: 'done',
                inputTokens: data.input_tokens as number | undefined,
                outputTokens: data.output_tokens as number | undefined,
            };
        case 'error':
            return { type: 'error', code: (data.code as string) ?? 'internal', message: (data.message as string) ?? '' };
        default:
            return null;
    }
}

export interface StreamChatParams {
    /** Existing chat id, or "new"/undefined to start a chat. */
    chatId?: string;
    message: string;
    image?: string | null;
    profileId: string | null;
    botId: string | null;
    signal: AbortSignal;
    onEvent: (event: ChatStreamEvent) => void;
}

/** Only fall back to XHR when fetch failed outright on an image message
 * (RN FormData parts unsupported); text-only failures are surfaced as errors. */
function shouldFallbackToXhr(status: number): boolean {
    return status >= 400;
}

function buildStreamFormData({ message, image, profileId, botId }: StreamChatParams): FormData {
    const formData = new FormData();
    formData.append('message', message);
    if (image) {
        const fileType = image.split('.').pop() || 'jpeg';
        formData.append('image', {
            uri: image,
            name: `image.${fileType}`,
            type: `image/${fileType}`,
        } as any);
    }
    if (profileId) formData.append('profile', profileId);
    if (botId) formData.append('bot', botId);
    return formData;
}

function emitFrame(onEvent: StreamChatParams['onEvent'], eventType: string, data: string) {
    const event = normalizeStreamEvent(eventType, data);
    if (event) {
        onEvent(event);
    }
}

/** XHR fallback for environments without ReadableStream responses. RN fires
 * progress events with an ever-growing responseText for streamed replies. */
function xhrStream(url: string, formData: FormData, token: string | undefined, signal: AbortSignal,
                   handleChunk: (chunk: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Accept', 'text/event-stream');
        let consumed = 0;
        xhr.onprogress = () => {
            const text = xhr.responseText;
            if (text && text.length > consumed) {
                handleChunk(text.slice(consumed));
                consumed = text.length;
            }
        };
        xhr.onload = () => {
            const text = xhr.responseText;
            if (text && text.length > consumed) {
                handleChunk(text.slice(consumed));
            }
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                reject(new Error(`Request to ${url} failed with status ${xhr.status}`));
            }
        };
        xhr.onerror = () => reject(new Error('Network request failed'));
        xhr.onabort = () => resolve();
        signal.addEventListener('abort', () => xhr.abort());
        xhr.send(formData);
    });
}

/**
 * POST the message and consume the SSE stream, forwarding each event to
 * onEvent. Resolves when the stream ends (done/error); rejects on network
 * failure. Aborting `signal` cancels in-flight generation — partial text is
 * kept server-side.
 *
 * Transport: fetch + ReadableStream per doc 06 §1. When response.body is not
 * available, falls back to XHR progress streaming (also required for RN's
 * proprietary FormData image parts, which Expo fetch does not support).
 */
export const streamChatMessage = async ({
    chatId,
    message,
    image,
    profileId,
    botId,
    signal,
    onEvent,
}: StreamChatParams): Promise<void> => {
    const params: StreamChatParams = { chatId, message, image, profileId, botId, signal, onEvent };
    const url = `${BASE_URL}/chats/${chatId || 'new'}/stream`;
    const formData = buildStreamFormData(params);

    let tokens: TokenData | null = await getTokens();

    // One parser per attempt: chunks can split frames (or carry several), so
    // all bytes of an attempt flow through the same buffering instance.
    const run = async (): Promise<void> => {
        const parser = createSseParser((eventType, data) => emitFrame(onEvent, eventType, data));

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokens?.access}`,
                'Accept': 'text/event-stream',
            },
            body: formData,
            signal,
        });

        if (response.status === 401) {
            throw new UnauthorizedError();
        }
        if (!response.ok && !(image && shouldFallbackToXhr(response.status))) {
            throw new Error(`Request to ${url} failed with status ${response.status}`);
        }

        if (response.ok) {
            if (response.body && typeof response.body.getReader === 'function') {
                // Preferred transport: fetch + ReadableStream (doc 06 §1).
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    parser.push(decoder.decode(value, { stream: true }));
                }
                parser.flush();
                return;
            }
            // Response OK but no streaming body support: the full SSE payload
            // arrived as text; parse it in one go (no second request needed).
            parser.push(await response.text());
            parser.flush();
            return;
        }

        // Fetch failed outright — on some runtimes that is because Expo's
        // fetch cannot send RN's proprietary {uri,name,type} FormData parts
        // (i.e. image messages). Retry once over XHR, which handles both.
        await xhrStream(url, formData, tokens?.access, signal, (chunk) => parser.push(chunk));
        parser.flush();
    };

    try {
        await run();
    } catch (error) {
        if (error instanceof UnauthorizedError && tokens?.refresh) {
            await refreshWithRefreshToken(tokens);
            tokens = await getTokens();
            await run();
            return;
        }
        throw error;
    }
};
export interface VoiceChatResponse extends ChatResponse {
    user_message?: string;
    blocked?: boolean;
    audio_base64?: string | null;
}

export const sendVoice = async (
    chatId: string = "new",
    formData: FormData,
): Promise<VoiceChatResponse | null> =>
    request<VoiceChatResponse | null>(`/chats/${chatId}/voice`, {
        method: 'POST',
        body: formData,
    }, null);
