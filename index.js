"use strict";
// Converted from the index.ts file

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
const Defaults = {
   ratingInterval: 400,
   ratingValue: 1500,
   ratingK: 500
};

class Game {
   static totalGames = 0;

   constructor (players, id) {
      this.id = id ?? Game.totalGames;
      this.players = players;
      this.startTime = null;
      this.finishTime = null;
      this.result = null;
      Game.totalGames++;

      for (const player of players) {
         if (!player.games.includes(this)) {
            player.games.push(this);
         }
      }
   }

   start () {
      return this.startTime = Date.now();
   }

   finish (result) {
      this.result = result;
      updatePlayers(this.players, result);
      return this.finishTime = Date.now();
   }
}

class Player {
   static totalPlayers = 0;

   constructor (id) {
      this.id = id ?? Player.totalPlayers;
      this.games = [];
      this.rating = new Rating(this);
      this.playedAgainst = {};
      Player.totalPlayers++;
   }
}

class Bot extends Player {
   constructor(id, version) {
      super(id);
      this.version = version;
   }
}

class Rating {
   constructor (player) {
      this.value = Defaults.ratingValue;
      this.lastCertainty = 0;
      this.player = player;
   }

   /**
    * Returns 1 - (1 / n)
    * where n = 1 + Σ(log_totalPlayers(player total games))
    */
   get certainty () {
      const totalGames = Object.values(this.player.playedAgainst)
                               .reduce((accum, curr) => accum + curr, 0)
      const n = 1 + (Math.log(Player.totalPlayers) / Math.log(totalGames))
      return 1 - (1 / n);
   }

   /** Gets the expected outcome when playing against some other rating */
   expectedOutcome (rating) {
      return 1 / (1 + (10 ** ((rating.value - this.value) / Defaults.ratingInterval)));
   }

   /** */
   static expectedOutcome (a, b) {
      if (a instanceof Rating && b instanceof Rating) {
         return a.expectedOutcome(b)
      }

      return 1 / (1 + (10 ** ((b - a) / Defaults.ratingInterval)));
   }
}
class Version {
   // prerelease is only a suggestion. It's the part after a hyphen
   // metadata is only a suggestion. It's the part after a minus sign.
   constructor (major, minor, patch, prerelease, metadata) {
      this.major = major;
      this.minor = minor;
      this.patch = patch;
      this.prerelease = prerelease ?? null;
      this.metadata = metadata ?? null;
   }

   toString () {
      let string = `${this.major}.${this.minor}.${this.patch}`;
      if (this.prerelease !== null) {
         string += `+${this.prerelease}`;
      }
      if (this.metadata !== null) {
         string += `-${this.metadata}`;
      }
      return string;
   }
}

/** This doesn't do what you think it does. Just use Game#finish() instead */
function updatePlayers (players, result) {
   for (const playerA of players) {
      for (const playerB of players) {
         if (playerA === playerB) {
            continue;
         }

         if (!(playerB.id in playerA.playedAgainst)) {
            // @ts-expect-error
            playerA.playedAgainst[playerB.id] = 1;
         } else {
            // @ts-expect-error
            playerA.playedAgainst[playerB.id]++;
         }

         if (!(playerA.id in playerB.playedAgainst)) {
            // @ts-expect-error
            playerB.playedAgainst[playerA.id] = 1;
         } else {
            // @ts-expect-error
            playerB.playedAgainst[playerA.id]++;
         }
      }
   }

   const expected = players.map(player => {
      let totalExpected = 0;
      for (const player2 of players) {
         if (player2 === player) {
            continue;
         }
         totalExpected += player.rating.expectedOutcome(player2.rating);
      }
      // Thanks internet
      return (totalExpected / (
         Player.totalPlayers * (Player.totalPlayers - 1) / 2)
      );
   });

   const lastCertainty = players.map(player => player.rating.lastCertainty);
   const certainty = players.map(player => player.rating.certainty);

   for (let i = 0; i < players.length; i++) {
      const halfWayCertainty = (lastCertainty[i] + certainty[i]) / 2
      players[i].rating.value += Defaults.ratingK * (result[i] - expected[i]) * (1 - halfWayCertainty);
      players[i].rating.lastCertainty = certainty[i];
   }

   console.assert(
      expected.reduce((accum, curr) => accum + curr) > 0.99999 &&
      expected.reduce((accum, curr) => accum + curr) < 1.00001
   );
}
