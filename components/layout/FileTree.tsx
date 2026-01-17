import { FileNode } from "@/lib/store";
import { ChevronRight, FileText, Folder, Trash2, Edit, FileType } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/plate-ui/context-menu";

interface FileTreeProps {
    nodes: FileNode[];
    activeId: string | null;
    onSelect: (node: FileNode) => void;
    onRename: (node: FileNode) => void;
    onDelete: (node: FileNode) => void;
    onMove: (source: FileNode, target: FileNode) => void;
    level?: number;
}

const FileTreeItem = ({ 
    node, 
    activeId, 
    onSelect, 
    onRename, 
    onDelete, 
    onMove, 
    level = 0 
}: { 
    node: FileNode; 
    activeId: string | null; 
    onSelect: (node: FileNode) => void; 
    onRename: (node: FileNode) => void;
    onDelete: (node: FileNode) => void;
    onMove: (source: FileNode, target: FileNode) => void;
    level: number;
}) => {
    const [expanded, setExpanded] = useState(false);
    const paddingLeft = `${level * 12 + 8}px`;

    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'FILE_NODE',
        item: { node },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    }));

    const [{ isOver, canDrop }, drop] = useDrop(() => ({
        accept: 'FILE_NODE',
        canDrop: (item: { node: FileNode }) => {
            // Can't drop on itself
            if (item.node.id === node.id) return false;
            // Can't drop folder into its own child
            if (node.id.startsWith(item.node.id + '/')) return false;
            // Only drop on folders (for now, to move INTO folder)
            // If we want reordering, we'd need more logic.
            return node.type === 'folder';
        },
        drop: (item: { node: FileNode }) => {
            if (node.type === 'folder') {
                onMove(item.node, node);
            }
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
            canDrop: monitor.canDrop(),
        }),
    }));

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (node.type === 'folder') {
            setExpanded(!expanded);
        } else {
            onSelect(node);
        }
    };
    
    // Combine drag and drop refs
    const ref = (el: HTMLDivElement | null) => {
        drag(drop(el));
    };

    const displayName = node.name.replace(/\.(md|json|mdt)$/, '');

    return (
        <div>
            <ContextMenu>
                <ContextMenuTrigger>
                    <div
                        ref={ref}
                        className={cn(
                            "flex items-center gap-1.5 py-1 text-sm rounded-sm cursor-pointer transition-colors group select-none mx-1",
                            activeId === node.id && "bg-accent text-accent-foreground font-medium",
                            !activeId || activeId !== node.id ? "hover:bg-accent/50 hover:text-accent-foreground" : "",
                            isDragging && "opacity-50",
                            isOver && canDrop && "bg-accent/30 ring-1 ring-primary/20"
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
                        ) : (node.name.endsWith('.json') || node.name.endsWith('.mdt')) ? (
                             <FileType size={14} className={cn("text-muted-foreground shrink-0", activeId === node.id && "text-primary")} />
                        ) : (
                            <FileText size={14} className={cn("text-muted-foreground shrink-0", activeId === node.id && "text-primary")} />
                        )}
                        
                        <span className="truncate">{displayName}</span>
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem onClick={(e) => { e.stopPropagation(); onRename(node); }}>
                        <Edit className="mr-2 h-4 w-4" />
                        Rename
                    </ContextMenuItem>
                    <ContextMenuItem 
                        onClick={(e) => { e.stopPropagation(); onDelete(node); }}
                        className="text-destructive focus:text-destructive"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
            
            {expanded && node.type === 'folder' && node.children && (
                <FileTree 
                    nodes={node.children} 
                    activeId={activeId} 
                    onSelect={onSelect} 
                    onRename={onRename}
                    onDelete={onDelete}
                    onMove={onMove}
                    level={level + 1} 
                />
            )}
        </div>
    );
};

export function FileTree(props: FileTreeProps) {
    return (
        <div className="space-y-0.5">
            {props.nodes.map((node) => (
                <FileTreeItem 
                    key={node.id} 
                    node={node} 
                    activeId={props.activeId} 
                    onSelect={props.onSelect} 
                    onRename={props.onRename}
                    onDelete={props.onDelete}
                    onMove={props.onMove}
                    level={props.level || 0}
                />
            ))}
        </div>
    );
}
