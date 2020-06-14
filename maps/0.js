function onMove (solve, player) {
  if (player.sg_x === 0) {
    solve()
  }
}

module.exports = onMove
