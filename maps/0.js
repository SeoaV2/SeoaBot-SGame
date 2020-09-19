function onMove (solve, player) {
  if (player.sg_y === 0) {
    solve()
  }
}

module.exports = onMove
