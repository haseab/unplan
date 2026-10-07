import { Folder, FolderOpen } from "lucide-react";

export function TaskFolderIcon({ active, inherited, collapsed }: {
  active: boolean;
  inherited: boolean;
  collapsed: boolean;
}) {
  const Icon = collapsed ? Folder : FolderOpen;
  return (
    <span className="task-folder-icon" data-active={active || undefined} data-inherited={inherited || undefined} title={active ? inherited ? "Active through a parent folder" : "Active folder" : "Inactive folder"}>
      <Icon aria-hidden="true" size={13} />
      {active && <span className="task-folder-active-spark" aria-hidden="true" />}
    </span>
  );
}
