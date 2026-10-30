(() => {
  const u = window.__um;
  const res = {};
  // battery: tray front (y 8.75) and the front cell's lit side (y 5) at several x, z
  for (const x of [-58, -55, -50, -45, -40, -30, -20, -12, -9]) for (const [y, z] of [[8.75, 5], [8.75, 9], [8.75, 12], [5.6, 14], [4, 18.5], [2, 21]]) res[`bat ${x},${y},${z}`] = u.probe([x, y, z], "battery");
  // limit: block front (y 31) and body front (y 28.7)
  for (const x of [-38, -36, -34, -30, -26, -20, -16]) for (const [y, z] of [[31, 8], [31, 12], [31, 16], [28.7, 20], [28.7, 24], [28.7, 27]]) res[`lim ${x},${y},${z}`] = u.probe([x, y, z], "mech");
  return JSON.stringify(res);
})()
