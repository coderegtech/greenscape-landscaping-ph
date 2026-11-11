# AI assistant

The floating chat on the public site. It answers signed-in customers from Greenscape's own verified information and
hands the conversation to a person on request.

## How it works

- **Widget** (`apps/web/components/chat/`): a button on every public page (not on sign-in or checkout pages). The
  panel's code loads on first open. It is a bottom sheet on phones and a panel on larger screens. It has:
  - streamed replies, a typing indicator, and a Stop button;
  - suggested questions;
  - saved chats (history, delete);
  - "Talk to a person";
  - the AI disclosure, which is always shown;
  - Escape to close, with focus returned to the button, and a reduced-motion fallback.

  Guests get the "Sign in to continue" prompt, and the chat reopens after sign-in.
- **API** (`apps/api/src/modules/assistant/`):
  - `GET /v1/assistant/config` is public: greeting, suggested questions, whether it is available.
  - `POST /v1/assistant/messages` needs sign-in and streams server-sent events: `meta`, then `delta`, then `done` or
    `error`. Guards, cheapest first:
    - a per-account rate limit (60 an hour, fails closed);
    - one reply at a time per account;
    - a rolling 24-hour message quota, counted in Postgres.

    Closing the widget aborts the provider call, so no tokens are spent on replies nobody reads.
  - `GET/DELETE /v1/assistant/conversations[/:id]` return the caller's own chats only. Anyone else's id answers 404.
  - `POST /v1/assistant/conversations/:id/escalate` posts the recent transcript into the customer's Messages thread
    with staff (the same path as `/messages`, with the same staff email) and marks the chat as passed to a person.
- **Knowledge (RAG)** (`knowledge.ts`): verified sources only, each switchable in the admin:
  - contact details and opening hours (CMS site settings);
  - published services, with pricing notes and packages;
  - published FAQs;
  - active shop products and their prices;
  - active delivery zones and fees;
  - entries staff write in Admin → Knowledge.

  The catalogue is cached for five minutes, and admin edits clear the cache. **Stock is looked up live** for the
  products being quoted, never from a cache. Retrieval is keyword-based (the top 8 matches, plus the contact details
  every time). This is enough at the current size; switch to embeddings if staff knowledge grows to hundreds of entries.
- **Prompt-injection defences:**
  - Knowledge and customer names are HTML-escaped inside `<source>` tags, so a document cannot close its tag or add
    instructions. This is unit tested.
  - The system prompt treats all knowledge and customer text as information, not instructions.
  - The assistant cannot act: it has no tools, it cannot book, reserve, charge or change orders, and it is told to
    send customers to a person for those.
  - A refusal (`stop_reason: refusal`) or a failed provider call shows a polite fallback, and the error is logged
    for admins.
- **Data and retention:** chats live in Postgres (`AssistantConversation`, `AssistantMessage`), with tokens, model and
  errors recorded per reply.
  - A job deletes chats untouched for longer than the retention setting (180 days by default) every six hours.
  - Customers can delete their chats on `/account`.
  - Deleting an account deletes its chats.

## Providers

| Provider | Configure | Notes |
|---|---|---|
| Claude (Anthropic) | `ANTHROPIC_API_KEY` in the **API's** environment | Official `@anthropic-ai/sdk`, streamed. Default model `claude-opus-5-5` (changeable in the admin). Uses low effort for quick chat replies, and the server-side refusal fallback on models that support it. |
| OpenAI-compatible | `OPENAI_COMPAT_BASE_URL` + `OPENAI_COMPAT_API_KEY` | Any `/chat/completions` service that streams server-sent events. |
| Offline test assistant | nothing | For development and automated tests: no network, no cost, and replies start with "(Test assistant)". **Refused in production.** |

- API keys are never stored in settings, sent to the admin, or sent to the browser. The admin only sees whether each
  provider is configured.
- Without a key, the default provider is the offline assistant in development. In production without a key, the
  assistant starts switched off.

## Admin (`admin.<domain>`, "AI assistant")

| Page | Permission | What |
|---|---|---|
| Assistant settings | `assistant.manage` (admin, super admin, content manager) | On/off, greeting, suggested questions, extra instructions, built-in sources, provider, model, longest reply, daily quota per customer, retention days. Audited (`assistant.settings`). |
| Knowledge | `assistant.manage` | Add, edit, switch off and delete entries. Each change is audited. |
| Chats and usage | `assistant.read` (admin, super admin) | Per day for 30 days: people, messages, input and output tokens, failures, recent errors (no message content). The chat list filters to chats passed to a person. **Opening a chat is recorded in the audit log** (`assistant.conversation.view`): these are customers' personal data. |

## Going live checklist

1. Set `ANTHROPIC_API_KEY` on the API service (from console.anthropic.com, in a workspace with a spend limit).
2. In Admin → AI assistant, check the provider and model, set the daily quota, and write the greeting.
3. Add knowledge entries for anything customers ask that is not on the site (service areas, warranty, payment
   methods).
4. Test a few questions on staging, including one the assistant should not answer, and check that the reply
   points to "Talk to a person".
5. Add the assistant to the privacy notice: chats are stored for the retention period and read by staff when passed
   to a person.
