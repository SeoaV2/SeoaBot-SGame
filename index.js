const { MessageEmbed } = require('discord.js')
const { readdirSync } = require('fs')
const { resolve: path } = require('path')

// if database is not connected, use this object
const fallback = {}
const maps = []

const mapsRoot = path() + '/extensions/SocketGame/maps/'

readdirSync(mapsRoot)
  .forEach((map) => {
    if (!map.endsWith('.json')) return
    const mapi = require(mapsRoot + map)
    mapi.script = require(mapsRoot + map.replace('.json', ''))
    maps.push(mapi)
  })

class SocketGame {
  /**
   * @param {import('../../classes/SeoaClient')} seoa
   */
  constructor (seoa) {
    this.client = seoa
  }

  async getStats (id) {
    let dbData
    try {
      dbData = await this.client.db('user').select('id', 'sg_stage', 'sg_x', 'sg_y').where('id', id)
    } catch (err) { console.error(err.stack); return fallback[id] || 0 }
    if (dbData.length < 1) return 0
    else return dbData[0]
  }

  /**
   * @param {import('discord.js').Message} msg
   * @param {import('discord.js').Message} origin
   */
  async load (msg, origin) {
    let dbData = await this.getStats(origin.author.id)
    if (!dbData) {
      msg.edit('초기화중..')
      try {
        await this.client.db('user').insert({ id: origin.author.id, sg_stage: 0, sg_x: 0, sg_y: 0 })
      } catch (err) { console.error(err.stack); fallback[origin.author.id] = { sg_stage: 0, sg_x: 0, sg_y: 0 } }
      dbData = await this.getStats(origin.author.id)
    }

    // for first run
    if (dbData.sg_stage < 1 && dbData.sg_x + dbData.sg_y < 1) {
      dbData.sg_x = maps[0].spawn[0]
      dbData.sg_y = maps[0].spawn[1]
      try {
        await this.client.db('user').update(dbData).where({ id: dbData.id })
      } catch (err) { console.error(err.stack); fallback[origin.author.id] = dbData }
    }

    if (dbData.sg_stage > 0) {
      msg.edit('전에 ' + dbData.sg_stage + '스테이지를 진행하던 내역이 있습니다\n이어서 진행할까요?')
      msg.react('✅')
      msg.react('❌')
      msg.awaitReactions((r, u) => ['✅', '❌'].includes(r.emoji.name) && u.id === origin.author.id, { time: 30000, max: 1 })
        .then(async (reactions) => {
          msg.reactions.removeAll()

          if (!reactions.first()) {
            msg.edit('응답 시간초과')
          } else if (reactions.first().emoji.name === '✅') {
            this.render(msg, origin, dbData)
          } else {
            try {
              await this.client.db('user').update({ sg_stage: 0, sg_x: 0, sg_y: 0 }).where({ id: origin.author.id })
            } catch (err) { console.error(err.stack); fallback[origin.author.id] = { sg_stage: 0, sg_x: 0, sg_y: 0 } }
            await this.load(msg, origin)
          }
        })
    } else { this.render(msg, origin, dbData); this.controller(msg, origin, dbData) }
  }

  render (msg, origin, dbData) {
    if (!maps[dbData.sg_stage]) return msg.edit('', new MessageEmbed({ color: 0xff0000, title: '스테이지 ' + dbData.sg_stage + '는 아직 제작중입니다' }))

    const { name, width, height, fills, ments, script } = maps[dbData.sg_stage]
    let render = '```\n'

    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        const t = fills[i][j] < 0 ? -1 : fills[i][j]
        let tg = ''

        switch (t) {
          case 1: {
            tg += '█'
            break
          }

          case 2: {
            tg += '▓'
            break
          }

          case -1: {
            tg += '░'
            break
          }

          default: {
            tg += ' '
          }
        }

        if (i === dbData.sg_x && j === dbData.sg_y) render += '⭐' + tg
        else render += tg.repeat(2)
      }

      render += '\n'
    }

    render += '```'

    const embed = new MessageEmbed({
      title: dbData.sg_stage + '. ' + name,
      description: '플레이어: ' + origin.author.username
    })

    if (fills[dbData.sg_x][dbData.sg_y] < 0) embed.addField('표지판', ments[fills[dbData.sg_x][dbData.sg_y] * -1 - 1])
    if (fills[dbData.sg_x][dbData.sg_y] > 1) embed.addField('코드', '```js\n' + script.toString() + '```')

    embed.addField('지도', render)
    embed.addField('좌표', 'x: ' + dbData.sg_x + ' | y: ' + dbData.sg_y)

    msg.edit('', embed)
  }

  /**
   * @param {import('discord.js').Message} msg
   * @param {import('discord.js').Message} origin
   */
  async controller (msg, origin, dbData) {
    msg.react('⬅️')
    msg.react('⬇️')
    msg.react('⬆️')
    msg.react('➡️')

    msg.awaitReactions((r, u) => ['⬅️', '⬇️', '⬆️', '➡️'].includes(r.emoji.name) && u.id === origin.author.id, { max: 1, time: 30000 })
      .then((reactions) => {
        if (!reactions.first()) return

        switch (reactions.first().emoji.name) {
          case '⬅️': {
            if (dbData.sg_y > -1 && maps[dbData.sg_stage].fills[dbData.sg_x][dbData.sg_y - 1] !== 1) dbData.sg_y--
            break
          }

          case '⬇️': {
            if (dbData.sg_x < maps[dbData.sg_stage].width - 1 && maps[dbData.sg_stage].fills[dbData.sg_x + 1][dbData.sg_y] !== 1) dbData.sg_x++
            break
          }

          case '⬆️': {
            if (dbData.sg_x > 0 && maps[dbData.sg_stage].fills[dbData.sg_x - 1][dbData.sg_y] !== 1) dbData.sg_x--
            break
          }

          case '➡️': {
            if (dbData.sg_y < maps[dbData.sg_stage].height - 1 && maps[dbData.sg_stage].fills[dbData.sg_x][dbData.sg_y + 1] !== 1) dbData.sg_y++
            break
          }
        }

        this.client.db('user').update(dbData).where({ id: origin.author.id }).then()
        const db = this.client.db

        async function solve () {
          dbData.sg_stage++
          if (maps[dbData.sg_stage]) {
            dbData.sg_x = maps[dbData.sg_stage].spawn[0]
            dbData.sg_y = maps[dbData.sg_stage].spawn[1]
          }
          await db('user').update(dbData).where({ id: origin.author.id })
        }

        if (maps[dbData.sg_stage].script) maps[dbData.sg_stage].script(solve, dbData)

        this.render(msg, origin, dbData)
        this.controller(msg, origin, dbData)
      })
  }
}

module.exports = SocketGame
