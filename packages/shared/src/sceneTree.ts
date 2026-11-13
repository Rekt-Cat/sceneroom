import type { Scene, SceneNode } from "./scene";

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
 * Rebuilds the parent/child tree from the flat node map. Nodes keep the order they have in the
 * scene. A node whose parent does not exist is shown at the top level, so nothing disappears.
 */
export function buildSceneTree(scene: Scene): TreeNode[] {
  const nodes = Object.values(scene.nodes);
  const childrenOf = new Map<string | null, SceneNode[]>();
  for (const node of nodes) {
    const key =
      node.parentId !== null && scene.nodes[node.parentId]
        ? node.parentId
        : null;
    const siblings = childrenOf.get(key) ?? [];
    siblings.push(node);
    childrenOf.set(key, siblings);
  }

  const build = (node: SceneNode): TreeNode => ({
    node,
    children: (childrenOf.get(node.id) ?? []).map(build),
  });
  return (childrenOf.get(null) ?? []).map(build);
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
