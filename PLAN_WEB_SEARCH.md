# Plan: Add Web Search Capability with Tavily (Per-Bot Control)

## Overview
Add web search capability to AI bots using Tavily, controlled per-bot via a toggle setting in the bot editor.

---

## 1. Backend Changes

### 1.1 Dependencies (`back/requirements.txt`)
Add:
```
tavily-python
```

### 1.2 Bot Model (`back/bots/models/bot.py`)
Add field:
```python
enable_web_search = models.BooleanField(default=False)
```

### 1.3 Bot Serializer (`back/bots/serializers/bot_serializer.py`)
Add to fields:
```python
'enable_web_search',
```

### 1.4 Chat Model (`back/bots/models/chat.py`)
Modify `get_response()` method:
- Check if `self.bot.enable_web_search` is True
- If enabled, add `TavilySearchResults` tool to the LangChain agent
- Handle Tavily API key from Django settings

### 1.5 Settings (`back/server/settings.py`)
Add Tavily API key configuration:
```python
TAVILY_API_KEY = env('TAVILY_API_KEY', default='')
```

---

## 2. Frontend Changes

### 2.1 Bot API (`front/api/bots.ts`)
Add to `Bot` interface:
```typescript
enable_web_search: boolean;
```

### 2.2 Bot Editor (`front/app/parent/botEditor.tsx`)
Initialize default in new bot:
```typescript
enable_web_search: false,
```

### 2.3 Simple Bot Editor (`front/app/parent/botSimple.tsx`)
Add toggle after existing switches:
```tsx
<ThemedView style={[styles.formGroupCheckbox, { backgroundColor: bgColor }]}>
  <ThemedText style={styles.checkboxLabel}>
    Enable Web Search
  </ThemedText>
  <Switch
    value={bot.enable_web_search}
    onValueChange={(value) =>
      setBotProperty({ enable_web_search: value })
    }
  />
</ThemedView>
```

---

## 3. Environment Setup

Add to backend environment (`.env`):
```
TAVILY_API_KEY=your_tavily_api_key
```

---

## Files to Modify

| File | Change |
|------|--------|
| `back/requirements.txt` | Add tavily-python |
| `back/bots/models/bot.py` | Add `enable_web_search` field |
| `back/bots/serializers/bot_serializer.py` | Add field to serializer |
| `back/bots/models/chat.py` | Integrate Tavily tool |
| `back/server/settings.py` | Add Tavily API key config |
| `front/api/bots.ts` | Add interface field |
| `front/app/parent/botEditor.tsx` | Initialize default |
| `front/app/parent/botSimple.tsx` | Add UI toggle |

---

## Migration Needed

After adding the `enable_web_search` field to the bot model, run:
```bash
cd back && python manage.py makemigrations && python manage.py migrate
```