export default function GroupsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="groups-workspace">
      <div className="main" id="main">
        {children}
      </div>
    </div>
  );
}
