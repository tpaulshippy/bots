from bots.models import Chat, Message


def show(chat, label):
    if chat is None:
        print(label, "NONE")
        return
    print("===", label, "===")
    print("chat_id:", chat.chat_id)
    print("title:", repr(chat.title))
    print("created_at:", chat.created_at.isoformat())
    print("modified_at:", chat.modified_at.isoformat())
    msgs = list(chat.messages.order_by("order", "created_at"))
    print("message_count:", len(msgs))
    for m in msgs[:8]:
        print("  -", m.role, "order=", m.order, "len=", len(m.text or ""))
    first = next((m for m in msgs if m.role == "assistant"), None)
    if first is None:
        print("NO ASSISTANT MESSAGE")
        return
    print("FIRST_ASSISTANT_LEN:", len(first.text or ""))
    print("FIRST_ASSISTANT_REPR:", repr(first.text))
    print("FIRST_ASSISTANT_TEXT_START")
    print(first.text)
    print("FIRST_ASSISTANT_TEXT_END")


show(Chat.objects.order_by("-created_at").first(), "MOST_RECENT_CREATED")
show(Chat.objects.order_by("-modified_at").first(), "MOST_RECENT_MODIFIED")
