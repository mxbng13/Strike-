import { requireActiveUser, requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { sendMessageSchema } from "@/lib/validators";
import { getMessages, sendMessage } from "@/server/conversations";

export const GET = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser();
  const before = req.nextUrl.searchParams.get("before") ?? undefined;
  return { messages: await getMessages(user.id, id, { before }) };
});

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireActiveUser();
  const input = await parseBody(req, sendMessageSchema);
  return sendMessage(user, id, input);
});
