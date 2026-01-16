import { FileNode } from "@/lib/store";
import { ChevronRight, ChevronDown, FileText, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface FileTreeProps {
    nodes: FileNode[];
    activeId: string | null;
    onSelect: (node: FileNode) => void;
    level?: number;
}

const FileTreeItem = ({ node, activeId, onSelect, level = 0 }: { 
    node: FileNode; 
    activeId: string | null; 
    onSelect: (node: FileNode) => void; 
    level: number;
}) => {
    const [expanded, setExpanded] = useState(false);
    const hasChildren = node.type === 'folder' && node.children && node.children.length > 0;
    const paddingLeft = `${level * 12 + 8}px`;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (node.type === 'folder') {
            setExpanded(!expanded);
        } else {
            onSelect(node);
        }
    };

    return (
        <div>
            <div
                className={cn(
                    "flex items-center gap-1.5 py-1 text-sm rounded-sm cursor-pointer hover:bg-accent/50 hover:text-accent-foreground transition-colors group select-none",
                    activeId === node.id && "bg-accent text-accent-foreground font-medium",
                    "mx-1"
                )}
                style={{ paddingLeft }}
                onClick={handleClick}
            >
                <span className="flex items-center justify-center w-4 h-4 shrink-0 text-muted-foreground/50">
                    {node.type === 'folder' && (
                        <ChevronRight 
                            size={12} 
                            className={cn("transition-transform", expanded && "rotate-90")} 
                        />
                    )}
                </span>
                
                {node.type === 'folder' ? (
                    <Folder size={14} className="text-blue-400/80 shrink-0" />
                ) : (
                    <FileText size={14} className={cn("text-muted-foreground shrink-0", activeId === node.id && "text-primary")} />
                )}
                
                <span className="truncate">{node.name}</span>
            </div>
            
            {expanded && node.type === 'folder' && node.children && (
                <FileTree 
                    nodes={node.children} 
                    activeId={activeId} 
                    onSelect={onSelect} 
                    level={level + 1} 
                />
            )}
        </div>
    );
};

export function FileTree({ nodes, activeId, onSelect, level = 0 }: FileTreeProps) {
    return (
        <div className="space-y-0.5">
            {nodes.map((node) => (
                <FileTreeItem 
                    key={node.id} 
                    node={node} 
                    activeId={activeId} 
                    onSelect={onSelect} 
                    level={level} 
                />
            ))}
        </div>
    );
}
