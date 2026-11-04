export function summarizeTimings(rows, pending) {
  const groups = {};
  for (const processor of ["gpu", "mixed", "cpu", "unknown"]) {
    const samples = rows.filter(x => x.validationTiming?.processor === processor && Number.isFinite(x.validationTiming.elapsedMs) && x.validationTiming.elapsedMs >= 0);
    if (!samples.length) continue;
    const seconds = samples.map(x => x.validationTiming.elapsedMs / 1000).sort((a,b)=>a-b);
    const mean = seconds.reduce((a,b)=>a+b,0)/seconds.length;
    const middle = Math.floor(seconds.length / 2);
    groups[processor] = {
      samples: seconds.length,
      meanSeconds: mean,
      medianSeconds: seconds.length % 2 ? seconds[middle] : (seconds[middle-1]+seconds[middle])/2,
      minSeconds: seconds[0], maxSeconds: seconds.at(-1),
      projectedRemainingHours: pending * mean / 3600,
    };
  }
  return groups;
}
