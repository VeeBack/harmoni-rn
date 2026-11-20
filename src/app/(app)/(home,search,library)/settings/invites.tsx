import { Invites } from "@/settings/Invites";
import { SettingsPage } from "@/settings/parts";
import { useSession } from "@/state/session";
import { EmptyState } from "@/ui/bits";

const lasts = (days: number) => (days === 1 ? "a day" : days === 7 ? "a week" : `${days} days`);

export default function InviteSettings() {
  const me = useSession((s) => s.me);
  const days = me?.server.inviteDays ?? 7;
  if (me && !me.server.canInvite) {
    return (
      <SettingsPage title="Invite people">
        <EmptyState icon="ticket" title="Invites are off" body="Only admins can invite people to this server." />
      </SettingsPage>
    );
  }
  return (
    <SettingsPage
      title="Invite people"
      description={`Invite links work once${days ? ` and expire after ${lasts(days)}` : ""}. The person picks their own username and password.`}
    >
      <Invites />
    </SettingsPage>
  );
}
