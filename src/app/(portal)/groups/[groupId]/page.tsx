import { GroupScreen } from "@/features/groups/GroupScreen";

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <GroupScreen id={groupId} />;
}
