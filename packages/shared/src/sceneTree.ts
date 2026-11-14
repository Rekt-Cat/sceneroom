import type { Scene, SceneNode } from "./scene";
import { groupChildren } from "./siblingOrder";

/** A node together with the nodes directly below it. */
export type TreeNode = {
  node: SceneNode;
  children: TreeNode[];
};

/** One line of the Hierarchy list. */
export type TreeRow = {
  node: SceneNode;
  /** 0 for top-level nodes, 1 for their children, and so on. */
  depth: number;
  hasChildren: boolean;
  /** False when the node's children are folded away. Always false if it has no children. */
  expanded: boolean;
};

/**
 * Rebuilds the parent/child tree from the flat node map. Siblings are in their `order` (and, where the
 * order is the same, in the order they were created). A node whose parent does not exist is shown at the top level, so nothing disappears.
 */
export function buildSceneTree(scene: Scene): TreeNode[] {
  const groups = groupChildren(scene);
  const build = (node: SceneNode): TreeNode => ({
    node,
    children: (groups.get(node.id) ?? []).map(build),
  });
  return (groups.get(null) ?? []).map(build);
}

/**
 * Turns the tree into the lines of a list, top to bottom. Children of a node whose id is in
 * `collapsed` are left out.
 */
export function flattenTree(
  tree: readonly TreeNode[],
  collapsed: ReadonlySet<string>,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (entries: readonly TreeNode[], depth: number) => {
    for (const { node, children } of entries) {
      const hasChildren = children.length > 0;
      const expanded = hasChildren && !collapsed.has(node.id);
      rows.push({ node, depth, hasChildren, expanded });
      if (expanded) visit(children, depth + 1);
    }
  };
  visit(tree, 0);
  return rows;
}

/**
 * Nodes whose name contains the text (ignoring upper/lower case and spaces around it), in scene
 * order. An empty search returns null, meaning "no filter, show the whole tree".
 */
export function searchNodes(scene: Scene, query: string): SceneNode[] | null {
  const needle = query.trim().toLowerCase();
  if (needle === "") return null;
  return Object.values(scene.nodes).filter((node) =>
    node.name.toLowerCase().includes(needle),
  );
}

/**
 * False if the node is hidden, or sits inside a hidden node (hiding a parent hides everything in it).
 * Unknown nodes count as not visible.
 */
export function isEffectivelyVisible(scene: Scene, id: string): boolean {
  const visited = new Set<string>();
  let current: string | null = id;
  while (current !== null && !visited.has(current)) {
    const node: SceneNode | undefined = scene.nodes[current];
    if (!node || !node.visible) return false;
    visited.add(current);
    current = node.parentId;
  }
  return true;
}

/**
 * True if the node is locked, or sits inside a locked node (locking a parent locks everything in it).
 * Unknown nodes count as not locked.
 */
export function isEffectivelyLocked(scene: Scene, id: string): boolean {
  const visited = new Set<string>();
  let current: string | null = id;
  while (current !== null && !visited.has(current)) {
    const node: SceneNode | undefined = scene.nodes[current];
    if (!node) return false;
    if (node.locked) return true;
    visited.add(current);
    current = node.parentId;
  }
  return false;
}

/** The ids that may be edited: known nodes that are not locked, directly or through a parent. */
export function editableIds(scene: Scene, ids: readonly string[]): string[] {
  return ids.filter(
    (id) => scene.nodes[id] !== undefined && !isEffectivelyLocked(scene, id),
  );
}
