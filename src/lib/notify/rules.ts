// Who hears about an event, and what it says (requirements N1). Pure so it can be tested without
// a database: lib/notify/index.ts loads the event and the members and records what this returns.
// Event types without a rule yet produce no notifications; each milestone adds its own.

export type ActivityEvent = {
  id: string;
  type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
};

export type MemberName = { id: string; display_name: string };

export type NotificationDraft = {
  recipientId: string;
  title: string;
  body: string;
  /** Opened when the notification is tapped. Same-site path. */
  url: string;
  /** Stays on screen until tapped (requireInteraction) because the recipient has to act. */
  requiresAction: boolean;
};

type Rule = (event: ActivityEvent, members: MemberName[]) => NotificationDraft[];

const nameOf = (members: MemberName[], id: unknown) =>
  members.find((member) => member.id === id)?.display_name ?? "メンバー";

const everyoneExcept = (members: MemberName[], id: string | null) => members.filter((member) => member.id !== id);

const RULES: Record<string, Rule> = {
  member_joined: (event, members) => {
    const name = nameOf(members, event.actor_id);
    const inviter = event.payload.invited_by;
    return everyoneExcept(members, event.actor_id).map((member) => ({
      recipientId: member.id,
      title: `${name} さんが参加しました`,
      body: typeof inviter === "string" ? `${nameOf(members, inviter)} さんの招待です` : "",
      url: "/",
      requiresAction: false,
    }));
  },
};

export function draftNotifications(event: ActivityEvent, members: MemberName[]): NotificationDraft[] {
  return RULES[event.type]?.(event, members) ?? [];
}
