
/*******************************************************************************
   Copyright (c) Steven Nguyen 2021
   This file is part of the bot-rating-system repo

   Bot-rating-system is free software: you can redistribute it and/or modify
   it under the terms of the GNU General Public License as published by
   the Free Software Foundation, either version 3 of the License, or
   (at your option) any later version.

   Bot-rating-system is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU General Public License for more details.

   You should have received a copy of the GNU General Public License
   along with bot-rating-system.  If not, see <https://www.gnu.org/licenses/>.
*******************************************************************************/

// Change as you want
export const Defaults = {
   ratingInterval: 400, // If PlayerA.rating.value === 400 + PlayerB.rating.value, 10x something
   ratingValue: 1500,
   ratingK: 500,
   ratingCertaintyCoefficient: 7 / 8
} as const

// Array whose indexes correspond to a game's player array.
export type Result = number[]
export type ID = number | string | symbol
export type gameParticipants = [Player, Player, ...Player[]]

export class Game {
   static totalGames = 0

   id: ID | null
   players: gameParticipants
   startTime: number | null
   finishTime: number | null
   result: Result | null

   constructor (players: gameParticipants, id?: ID) {
      this.id = id ?? Game.totalGames

      this.players = players
      this.startTime = null
      this.finishTime = null
      this.result = null

      Game.totalGames++

      for (const player of players) {
         if (!player.games.includes(this)) {
            player.games.push(this)
         }
      }
   }

   start (): number {
      return (this.startTime = Date.now()) // intentional return-assign
   }

   finish (result: Result): number {
      this.result = result
      updatePlayerStats(this.players, result)
      return (this.finishTime = Date.now()) // intentional return assign
   }
}

export class Player {
   static totalPlayers: number = 0

   id: ID
   games: Game[]
   rating: Rating
   gamesAgainst: {
      // @ts-expect-error
      [key: ID]: number
   }

   constructor (id?: ID) {
      this.id = id ?? Player.totalPlayers++
      this.games = []
      this.rating = new Rating(this)
      this.gamesAgainst = {}
      Player.totalPlayers++
   }
}

export class Bot extends Player {
   version: Version
   constructor (id: ID, version: Version) {
      super(id)
      this.version = version
   }
}

export class Rating {
   value: number
   player: Player

   constructor (player: Player) {
      this.value = Defaults.ratingValue
      this.player = player
   }

   certaintyAgainstPlayers (players: gameParticipants): number {
      let totalCertainty = 0
      for (const player of players) {
         if (player === this.player) {
            players.splice(players.indexOf(player), 1) // Delete player to correct players.length
            continue
         }
         totalCertainty += this.certaintyAgainstPlayer(player)
      }

      return totalCertainty / players.length
   }

   certaintyAgainstPlayer (player: Player): number {
      // @ts-expect-error
      const gamesAgainstPlayer = (this.player.gamesAgainst[player.id] as number)
      const lastCertaintyAgainstPlayer = 1 - (Defaults.ratingCertaintyCoefficient ** (gamesAgainstPlayer - 1))
      const currentCertaintyAgainstPlayer = 1 - (Defaults.ratingCertaintyCoefficient ** (gamesAgainstPlayer))
      return (lastCertaintyAgainstPlayer + currentCertaintyAgainstPlayer) / 2
   }

   /** Gets the expected outcome when playing against some other rating */
   expectedOutcome (rating: Rating): number {
      return 1 / (1 + (10 ** ((rating.value - this.value) / Defaults.ratingInterval)))
   }
}

export class Version {
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

   toString (): string {
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

export function updatePlayerStats (players: gameParticipants, result: Result): void {
   for (const playerA of players) {
      for (const playerB of players) {
         if (playerA === playerB) {
            continue
         }

         if (!(playerB.id in playerA.gamesAgainst)) {
            // @ts-expect-error
            playerA.gamesAgainst[playerB.id] = 1
         } else {
            // @ts-expect-error
            playerA.gamesAgainst[playerB.id]++
         }

         if (!(playerA.id in playerB.gamesAgainst)) {
            // @ts-expect-error
            playerB.gamesAgainst[playerA.id] = 1
         } else {
            // @ts-expect-error
            playerB.gamesAgainst[playerA.id]++
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

   const certainty = players.map(player => player.rating.certaintyAgainstPlayers(players))

   for (let i = 0; i < players.length; i++) {
      players[i].rating.value += Defaults.ratingK * (result[i] - expected[i]) * (1 - certainty[i])
   }

   console.assert(
      expected.reduce((accum, curr) => accum + curr) > 0.999999999 &&
      expected.reduce((accum, curr) => accum + curr) < 1.000000001
   )
}
