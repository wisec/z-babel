const DEFAULT_LABELS = {
  north: "N", south: "S", east: "E", west: "W",
  northeast: "NE", northwest: "NW", southeast: "SE", southwest: "SW",
  up: "UP", down: "DOWN", enter: "ENTER", exit: "EXIT", in: "IN", out: "OUT",
  transition: "GO",
};

export class MapView {
  constructor(container) {
    this.container = container;
    this.graph = null;
    this.emptyText = "No rooms explored.";
    this.directionLabels = DEFAULT_LABELS;
    this.commandLabels = {};
  }

  setEmptyText(value) {
    this.emptyText = value;
    if (this.container.classList.contains("empty")) this.container.textContent = value;
  }

  setDirectionLabels(labels) {
    this.directionLabels = { ...DEFAULT_LABELS, ...labels };
  }

  setCommandLabels(labels) {
    this.commandLabels = labels;
  }

  render(map) {
    this.graph?.destroy();
    this.graph = null;
    this.container.replaceChildren();
    this.container.classList.toggle("empty", !map.rooms.length);
    if (!map.rooms.length) {
      this.container.textContent = this.emptyText;
      return;
    }
    if (!window.cytoscape) throw new Error("The bundled map library could not be loaded.");
    const theme = getComputedStyle(document.documentElement);
    const color = (name, fallback) => theme.getPropertyValue(name).trim() || fallback;
    const surface = color("--surface", "#ffffff");
    const surfaceSoft = color("--surface-soft", "#f7f6f1");
    const ink = color("--ink", "#171a1c");
    const muted = color("--muted", "#5f6768");
    const line = color("--line", "#ccd1ce");
    const accent = color("--accent", "#17665a");

    this.graph = window.cytoscape({
      container: this.container,
      elements: [
        ...map.rooms.map((room) => ({
          group: "nodes",
          data: { id: room.id, label: room.name },
          position: { x: room.x * 150, y: room.y * 120 },
          classes: room.id === map.current ? "current" : "",
        })),
        ...map.edges.map((edge, index) => ({
          group: "edges",
          data: {
            id: `edge-${index}`,
            source: edge.from,
            target: edge.to,
            label: this.#edgeLabel(edge),
          },
        })),
      ],
      layout: { name: "preset", fit: true, padding: 42 },
      minZoom: 0.25,
      maxZoom: 2.5,
      style: [
        {
          selector: "node",
          style: {
            "background-color": surface, "border-color": line, "border-width": 2,
            label: "data(label)", color: ink, "font-size": 12,
            "text-valign": "bottom", "text-margin-y": 8, "text-wrap": "wrap",
            "text-max-width": 100, width: 30, height: 30,
            "text-background-opacity": 0, "text-outline-width": 0,
          },
        },
        {
          selector: "node.current",
          style: { "background-color": surfaceSoft, "border-color": accent, "border-width": 4, "font-weight": 700 },
        },
        {
          selector: "edge",
          style: {
            "curve-style": "bezier", "target-arrow-shape": "triangle",
            "target-arrow-color": muted, "line-color": muted, width: 2,
            label: "data(label)", "font-size": 10, color: ink,
            "text-background-opacity": 0, "text-outline-width": 0,
          },
        },
      ],
    });
  }

  fit() {
    this.graph?.fit(undefined, 42);
  }

  #edgeLabel(edge) {
    if (edge.direction !== "transition") return this.directionLabels[edge.direction] || edge.direction;
    const command = edge.userCommand || edge.command || "";
    return this.commandLabels[command] || command;
  }
}
