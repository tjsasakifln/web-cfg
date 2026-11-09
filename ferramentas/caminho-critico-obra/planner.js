// Based on SamGo1006/dependency-atlas @ 4ee7e870f273fa068bf37d9fa81a84ff36fa5eda.
// MIT license in LICENSE.txt. Terminal milestones are included when finishes tie.
export function parseTasks(input) {
    if (!Array.isArray(input) || input.length === 0) throw new Error('Expected a nonempty task array');
    const ids = new Set();
    const tasks = input.map((value)=>{
        if (typeof value !== 'object' || value === null) throw new Error('Task must be an object');
        const t = value;
        if (typeof t.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(t.id)) throw new Error('Invalid task id');
        if (ids.has(t.id)) throw new Error(`Duplicate task: ${t.id}`);
        ids.add(t.id);
        if (typeof t.duration !== 'number' || !Number.isFinite(t.duration) || t.duration < 0) throw new Error(`Invalid duration: ${t.id}`);
        if (!Array.isArray(t.dependsOn) || !t.dependsOn.every((id)=>typeof id === 'string')) throw new Error(`Invalid dependencies: ${t.id}`);
        if (new Set(t.dependsOn).size !== t.dependsOn.length) throw new Error(`Repeated dependency: ${t.id}`);
        return {
            id: t.id,
            duration: t.duration,
            dependsOn: [
                ...t.dependsOn
            ]
        };
    });
    for (const task of tasks)for (const dep of task.dependsOn)if (!ids.has(dep)) throw new Error(`Unknown dependency ${dep} for ${task.id}`);
    return tasks;
}
export function plan(input) {
    const tasks = parseTasks(input);
    const byId = new Map(tasks.map((t)=>[
            t.id,
            t
        ]));
    const children = new Map(tasks.map((t)=>[
            t.id,
            []
        ]));
    const indegree = new Map(tasks.map((t)=>[
            t.id,
            t.dependsOn.length
        ]));
    for (const t of tasks)for (const dep of t.dependsOn)children.get(dep).push(t.id);
    const queue = tasks.filter((t)=>t.dependsOn.length === 0).map((t)=>t.id);
    const order = [];
    const starts = new Map(), finishes = new Map();
    const predecessor = new Map();
    for(let i = 0; i < queue.length; i++){
        const id = queue[i], task = byId.get(id);
        let start = 0;
        for (const dep of task.dependsOn){
            const finish = finishes.get(dep);
            if (!predecessor.has(id) || finish > start) {
                start = finish;
                predecessor.set(id, dep);
            }
        }
        const finish = start + task.duration;
        if (!Number.isFinite(finish)) throw new Error('Schedule duration overflow');
        starts.set(id, start);
        finishes.set(id, finish);
        order.push(id);
        for (const child of children.get(id)){
            const remaining = indegree.get(child) - 1;
            indegree.set(child, remaining);
            if (remaining === 0) queue.push(child);
        }
    }
    if (order.length !== tasks.length) {
        const blocked = tasks.filter((t)=>indegree.get(t.id) > 0).map((t)=>t.id);
        throw new Error(`Cycle detected; blocked tasks: ${blocked.join(', ')}`);
    }
    let end = order[0];
    for (const id of order)if (finishes.get(id) > finishes.get(end) || (finishes.get(id) === finishes.get(end) && children.get(id).length === 0)) end = id;
    const duration = finishes.get(end);
    const latest = new Map();
    for (const id of [
        ...order
    ].reverse()){
        let finish = duration;
        for (const child of children.get(id))finish = Math.min(finish, latest.get(child));
        latest.set(id, finish - byId.get(id).duration);
    }
    const criticalPath = [];
    for(let id = end; id !== undefined; id = predecessor.get(id))criticalPath.push(id);
    return {
        duration,
        criticalPath: criticalPath.reverse(),
        tasks: order.map((id)=>({
                ...byId.get(id),
                start: starts.get(id),
                finish: finishes.get(id),
                slack: Math.max(0, latest.get(id) - starts.get(id))
            }))
    };
}
