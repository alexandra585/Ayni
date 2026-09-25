import { CreatedScreen } from "@/features/groups/CreatedScreen";

export default async function CreatedPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <CreatedScreen id={groupId} />;
}
