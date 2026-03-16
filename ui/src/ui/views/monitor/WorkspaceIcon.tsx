import { Globe, Figma, Bug, Server, FileText, Layout, FolderOpen } from "lucide-react";
import React from "react";

export function WorkspaceIcon({
  workspace,
  size = 12,
  className = "",
}: {
  workspace: string;
  size?: number;
  className?: string;
}) {
  switch (workspace.toLowerCase()) {
    case "browser":
      return <Globe size={size} className={className} />;
    case "figma":
      return <Figma size={size} className={className} />;
    case "sentry":
      return <Bug size={size} className={className} />;
    case "staging env":
    case "staging":
      return <Server size={size} className={className} />;
    case "notion":
      return <FileText size={size} className={className} />;
    default:
      if (workspace.startsWith("/") || workspace.includes("\\")) {
        return <FolderOpen size={size} className={className} />;
      }
      return <Layout size={size} className={className} />;
  }
}
