/** Static value edges only: type-only imports are erased and dynamic imports are lazy, so neither forms an evaluation cycle. */
export function valueGraph(graph) {
  return new Map([...graph].map(([file, edges]) => [file, edges.filter((edge) => edge.staticValue && graph.has(edge.to)).map((edge) => edge.to)]));
}

function strongConnect(start, graph, state) {
  const work = [{ node: start, next: 0 }];
  state.index.set(start, state.counter);
  state.low.set(start, state.counter);
  state.counter += 1;
  state.stack.push(start);
  state.onStack.add(start);
  while (work.length > 0) {
    const frame = work[work.length - 1];
    const successors = graph.get(frame.node) ?? [];
    if (frame.next < successors.length) {
      const successor = successors[frame.next];
      frame.next += 1;
      if (!state.index.has(successor)) {
        state.index.set(successor, state.counter);
        state.low.set(successor, state.counter);
        state.counter += 1;
        state.stack.push(successor);
        state.onStack.add(successor);
        work.push({ node: successor, next: 0 });
      } else if (state.onStack.has(successor)) {
        state.low.set(frame.node, Math.min(state.low.get(frame.node), state.index.get(successor)));
      }
      continue;
    }
    work.pop();
    if (work.length > 0) {
      const parent = work[work.length - 1].node;
      state.low.set(parent, Math.min(state.low.get(parent), state.low.get(frame.node)));
    }
    if (state.low.get(frame.node) === state.index.get(frame.node)) state.components.push(popComponent(frame.node, state));
  }
}

function popComponent(root, state) {
  const component = [];
  let member;
  do {
    member = state.stack.pop();
    state.onStack.delete(member);
    component.push(member);
  } while (member !== root);
  return component;
}

/**
 * File-level import cycles (Tarjan, iterative): every strongly connected
 * component with more than one file, or a file importing itself. Members are
 * sorted; components are ordered largest first.
 */
export function findCycles(graph) {
  const state = { index: new Map(), low: new Map(), stack: [], onStack: new Set(), counter: 0, components: [] };
  for (const node of [...graph.keys()].sort((left, right) => left.localeCompare(right, "en"))) {
    if (!state.index.has(node)) strongConnect(node, graph, state);
  }
  return state.components
    .filter((component) => component.length > 1 || (graph.get(component[0]) ?? []).includes(component[0]))
    .map((component) => component.sort((left, right) => left.localeCompare(right, "en")))
    .sort((left, right) => right.length - left.length || left[0].localeCompare(right[0], "en"));
}

/**
 * The cycle ratchet: every current cycle must lie inside one recorded cycle.
 * A new cycle, or a recorded one that absorbed another file, is unexpected.
 * A recorded cycle naming a file that no longer exists is stale; one that
 * shrank or disappeared is tightenable.
 */
export function compareCycles(current, recorded, available) {
  const recordedSets = recorded.map((cycle) => new Set(cycle));
  const unexpected = current.filter((cycle) => !recordedSets.some((set) => cycle.every((file) => set.has(file))));
  const currentKeys = new Set(current.map((cycle) => cycle.join("\n")));
  const stale = recorded.filter((cycle) => cycle.some((file) => !available.has(file)));
  const tightenable = recorded.filter((cycle) => !stale.includes(cycle) && !currentKeys.has(cycle.join("\n")));
  return { unexpected, stale, tightenable };
}

export function cycleSummary(cycles) {
  return { count: cycles.length, files: cycles.reduce((sum, cycle) => sum + cycle.length, 0), largest: cycles[0]?.length ?? 0 };
}
