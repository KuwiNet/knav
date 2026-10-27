import { getCurrentUser, listNotifications } from "@/lib/auth";
import NotificationList from "@/components/notification-list";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = (await getCurrentUser())!;
  const notices = await listNotifications(user.id, 100);

  return <NotificationList notices={notices} />;
}
