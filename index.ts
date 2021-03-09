
/*******************************************************************************
    Copyright (c) Steven Nguyen 2021
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*******************************************************************************/

// Change as you want
/** 
 * This is the first way I figured out how to do this
 * There's probably a better way
 * Workaround to make Defaults' properties readonly
 */
function Workaround () {
   return {
      ratingInterval: 400, // If PlayerA.rating.value === 400 + PlayerB.rating.value, 10x something
      ratingValue: 1500,
      ratingK: 500
   }
}

const Defaults: Readonly<ReturnType<typeof Workaround>> = Workaround()

// Array whose indexes correspond to a game's player array.
type Result = number[]
type ID = number | string | symbol
type gameParticipants = [Player, Player, ...Player[]]

class Game {
   static totalGames = 0

   id: ID | null
   players: gameParticipants
   startTime: number | null
   finishTime: number | null
   result: Result | null

   constructor (players: gameParticipants, id?: ID) {
      this.id = id ?? Game.totalGames++

      this.players = players
      this.startTime = null
      this.finishTime = null
      this.result = null
      for (const player of players) {
         if (!player.games.includes(this)) {
            player.games.push(this)
         }
      }
   }

   start (): number {
      return this.startTime = Date.now()
   }

   finish (result: Result): number {
      this.result = result
      updatePlayers(this.players, result)
      return this.finishTime = Date.now()
   }
}

class Player {
   static totalPlayers: number = 0

   id: ID
   games: Game[]
   rating: Rating
   playedAgainst: {
      // @ts-expect-error
      [key: ID]: number
   }

   constructor (id?: ID) {
      this.id = id ?? Player.totalPlayers++
      this.games = []
      this.rating = new Rating(this)
      this.playedAgainst = {}
      Player.totalPlayers++
   }
}

class Bot extends Player {
   version: Version
   constructor (id: ID, version: Version) {
      super(id)
      this.version = version
   }
}

class Rating {
   value: number
   lastCertainty: number
   player: Player

   constructor (player: Player) {
      this.value = Defaults.ratingValue
      this.lastCertainty = 0
      this.player = player
   }

   /**
    * Returns 1 - (1 / n)
    * where n = 1 + Σ(log_totalPlayers(total games))
    */
   get certainty (): number {
      return 1 - (
         1 / (
            1 + (
               Math.log(Player.totalPlayers) /
               Math.log(
                  Object.values(this.player.playedAgainst).reduce(
                     (accum, curr) => accum as number + (curr as number), 0
                  ) as number
               )
            )
         )
      )
   }

   /** Gets the expected outcome when playing against some other rating */
   expectedOutcome (rating: Rating) {
      return 1 / (1 + (10 ** ((rating.value - this.value) / Defaults.ratingInterval)))
   }

   static expectedOutcome (a: number, b: number) {
      return 1 / (1 + (10 ** ((b - a) / Defaults.ratingInterval)))
   }
}

class Version {
   major: number
   minor: number
   patch: number
   prerelease: string | null
   metadata: string | null

   // prerelease is only a suggestion. It's the part after a hyphen
   // metadata is only a suggestion. It's the part after a minus sign.
   constructor (major: number, minor: number, patch: number, prerelease?: string, metadata?: string) {
      this.major = major
      this.minor = minor
      this.patch = patch
      this.prerelease = prerelease ?? null
      this.metadata = metadata ?? null
   }

   toString () {
      let string = `${this.major}.${this.minor}.${this.patch}`
      if (this.prerelease !== null) {
         string += `+${this.prerelease}`
      }
      if (this.metadata !== null) {
         string += `-${this.metadata}`
      }
      return string
   }
}

function updatePlayers (players: gameParticipants, result: Result) {
   for (const playerA of players) {
      for (const playerB of players) {
         if (playerA === playerB) {
            continue;
         }
         if (!(playerB.id in playerA.playedAgainst)) {
            // @ts-expect-error
            playerA.playedAgainst[playerB.id] = 1
         } else {
            // @ts-expect-error
            playerA.playedAgainst[playerB.id]++
         }
         if (!(playerA.id in playerB.playedAgainst)) {
            // @ts-expect-error
            playerB.playedAgainst[playerA.id] = 1
         } else {
            // @ts-expect-error
            playerB.playedAgainst[playerA.id]++
         }
      }
   }

   const expected = players.map(player => {
      let totalExpected = 0
      for (const player2 of players) {
         if (player2 === player) {
            continue
         }
         totalExpected += player.rating.expectedOutcome(player2.rating)
      }
      // From (insecure link) http://sradack.blogspot.com/2008/06/elo-rating-system-multiple-players.html
      // Thanks to https://gamedev.stackexchange.com/questions/55441/player-ranking-using-elo-with-more-than-two-players
      return (
         totalExpected / (
            Player.totalPlayers * (Player.totalPlayers - 1) / 2
         )
      )
   })

   const lastCertainty = players.map(player => player.rating.lastCertainty)
   const certainty = players.map(player => player.rating.certainty)

   for (let i = 0; i < players.length; i++) {
      players[i].rating.value += Defaults.ratingK * (result[i] - expected[i]) * (1 - ((lastCertainty[i] + certainty[i]) / 2))
      players[i].rating.lastCertainty = certainty[i]
   }

   console.assert(
      expected.reduce((accum, curr) => accum + curr) > 0.999999999 &&
      expected.reduce((accum, curr) => accum + curr) < 1.000000001
   )
}
