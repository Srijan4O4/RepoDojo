"""
RepoDojo Graphify Engine
In-process NetworkX code graph query engine (Decision 9.1 & 9.2).
Provides sub-millisecond AST node traversal, caller/callee resolution, and context assembly.
"""

from typing import Any

import networkx as nx


class GraphifyEngine:
    """In-memory directed graph of repository code entities and AST relationships."""

    def __init__(self):
        self._graphs: dict[str, nx.DiGraph] = {}

    def load_challenge_graph(self, challenge_id: str, graph_data: dict[str, Any]) -> int:
        """
        Loads precomputed Graphify AST JSON into an in-memory NetworkX DiGraph.
        graph_data schema: { "nodes": [...], "edges": [...] }
        """
        g = nx.DiGraph()

        # Add nodes
        for node in graph_data.get("nodes", []):
            node_id = node.get("id")
            if node_id:
                g.add_node(
                    node_id,
                    name=node.get("name", node_id),
                    type=node.get("type", "entity"),  # file, function, class, endpoint
                    file=node.get("file", ""),
                    line_start=node.get("line_start", 1),
                    line_end=node.get("line_end", 1),
                    docstring=node.get("docstring", ""),
                )

        # Add edges (calls, imports, defines, inherits)
        for edge in graph_data.get("edges", []):
            source = edge.get("source")
            target = edge.get("target")
            rel = edge.get("relation", "references")
            if source and target:
                g.add_edge(source, target, relation=rel)

        self._graphs[challenge_id] = g
        return g.number_of_nodes()

    def get_or_create_default_graph(self, challenge_id: str) -> nx.DiGraph:
        """Returns the loaded graph or seeds a realistic baseline graph for node-ecommerce-01."""
        if challenge_id in self._graphs:
            return self._graphs[challenge_id]

        # Seed realistic default AST graph for the standard assessment challenge
        default_data = {
            "nodes": [
                {
                    "id": "src/index.ts",
                    "name": "index.ts",
                    "type": "file",
                    "file": "src/index.ts",
                },
                {
                    "id": "src/controllers/order.controller.ts",
                    "name": "order.controller.ts",
                    "type": "file",
                    "file": "src/controllers/order.controller.ts",
                },
                {
                    "id": "src/services/payment.service.ts",
                    "name": "payment.service.ts",
                    "type": "file",
                    "file": "src/services/payment.service.ts",
                },
                {
                    "id": "fn:calculateOrderTotal",
                    "name": "calculateOrderTotal",
                    "type": "function",
                    "file": "src/services/payment.service.ts",
                    "line_start": 7,
                    "line_end": 18,
                },
                {
                    "id": "fn:processPayment",
                    "name": "processPayment",
                    "type": "function",
                    "file": "src/services/payment.service.ts",
                    "line_start": 20,
                    "line_end": 28,
                },
                {
                    "id": "route:postCheckout",
                    "name": "POST /checkout",
                    "type": "endpoint",
                    "file": "src/controllers/order.controller.ts",
                    "line_start": 6,
                    "line_end": 16,
                },
            ],
            "edges": [
                {
                    "source": "src/index.ts",
                    "target": "src/controllers/order.controller.ts",
                    "relation": "imports",
                },
                {
                    "source": "src/controllers/order.controller.ts",
                    "target": "src/services/payment.service.ts",
                    "relation": "imports",
                },
                {
                    "source": "route:postCheckout",
                    "target": "fn:calculateOrderTotal",
                    "relation": "calls",
                },
                {
                    "source": "route:postCheckout",
                    "target": "fn:processPayment",
                    "relation": "calls",
                },
            ],
        }
        self.load_challenge_graph(challenge_id, default_data)
        return self._graphs[challenge_id]

    def query_relevant_nodes(
        self,
        challenge_id: str,
        query_text: str,
        active_file: str | None = None,
        depth: int = 1,
    ) -> list[dict[str, Any]]:
        """
        Finds relevant code nodes matching query tokens or active file,
        traversing 1-2 degrees of callers, callees, and imports (Decision 9.2).
        """
        g = self.get_or_create_default_graph(challenge_id)
        relevant_ids: set[str] = set()

        query_lower = query_text.lower()

        # 1. Match direct mentions in query text
        for node_id, data in g.nodes(data=True):
            name = data.get("name", "").lower()
            file_name = data.get("file", "").lower()

            if name and name in query_lower:
                relevant_ids.add(node_id)
            elif active_file and active_file.lower() in file_name:
                relevant_ids.add(node_id)

        # Fallback to active file or first node if no match
        if not relevant_ids and active_file:
            for node_id, data in g.nodes(data=True):
                if active_file in data.get("file", ""):
                    relevant_ids.add(node_id)

        # 2. Traverse callers and callees (depth 1)
        expanded_ids = set(relevant_ids)
        for nid in relevant_ids:
            if nid in g:
                # Predecessors (callers / importers)
                expanded_ids.update(g.predecessors(nid))
                # Successors (callees / dependencies)
                expanded_ids.update(g.successors(nid))

        # 3. Assemble structured context
        results: list[dict[str, Any]] = []
        for nid in list(expanded_ids)[:8]:  # Limit to top 8 entities to respect token budget
            if nid in g:
                node_data = dict(g.nodes[nid])
                node_data["id"] = nid
                node_data["callers"] = list(g.predecessors(nid))
                node_data["callees"] = list(g.successors(nid))
                results.append(node_data)

        return results

    def format_graph_context_for_prompt(
        self,
        challenge_id: str,
        query_text: str,
        active_file: str | None = None,
    ) -> str:
        """Formats graph context into markdown bullet points for Gemini 3.8 Flash prompt injection."""
        nodes = self.query_relevant_nodes(challenge_id, query_text, active_file)
        if not nodes:
            return "No structural code graph relationships found for this query."

        lines = ["### Graphify Structural Repository Context (AST Graph):"]
        for n in nodes:
            name = n.get("name", n["id"])
            ntype = n.get("type", "entity")
            file_path = n.get("file", "unknown")
            callers = ", ".join(n.get("callers", [])) or "none"
            callees = ", ".join(n.get("callees", [])) or "none"

            lines.append(
                f"- **{name}** ({ntype}) in `{file_path}`:\n"
                f"  - Called by / Imported by: {callers}\n"
                f"  - Calls / Depends on: {callees}"
            )

        return "\n".join(lines)


# Global singleton
graphify_engine = GraphifyEngine()
