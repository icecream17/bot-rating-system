
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

import { PlayerMap, Result, Defaults, Playerbase, Glicko2Rating, Glicko2Game, Glicko2Player, Glicko2Bot, updatePlayerStats } from './glicko2'
import { Version } from './index'

describe('Defaults', () => {
   test('Values which cannot be changed', () => {
      expect(Defaults.glicko2ScaleFactor).toBe(173.7178)
      expect(Defaults.ratingInterval).toBe(400)
      expect(Defaults.ratingValue).toBe(1500)
      expect(Defaults.ratingDV).toBe(350)
   })

   test('Not totally wrong', () => {
      expect(Defaults.ratingVolatility).toBeGreaterThan(0)
      expect(Defaults.ratingVolatility).toBeLessThan(1000)
      expect(Defaults.systemTau).toBeGreaterThanOrEqual(0)
      expect(Defaults.systemTau).toBeLessThan(5)
      expect(Defaults.systemRatingPeriodLength).toBeGreaterThan(0)
      expect(Defaults.systemRatingPeriodLength).not.toBe(Infinity)
      expect(Defaults.convergenceTolerance).toBeGreaterThanOrEqual(0)
      expect(Defaults.convergenceTolerance).toBeLessThanOrEqual(0.000001)
   })
})

describe('System', () => {
   const playerA = new Glicko2Player()
   const playerB = new Glicko2Player()

   test('New players have a rating', () => {
      expect(playerA.rating).toBeInstanceOf(Glicko2Rating)
      expect(playerB.rating).toBeInstanceOf(Glicko2Rating)
   })

   test('Different players have different ids', () => {
      expect(playerA.id).not.toBe(playerB.id)
   })

   test('After ABBA, A.rating === B.rating', () => {
      const game1 = new Glicko2Game([playerA, playerB], undefined, true)
      game1.finish([1, 0])
      const game2 = new Glicko2Game([playerA, playerB], undefined, true)
      game2.finish([0, 1])
      const game3 = new Glicko2Game([playerA, playerB], undefined, true)
      game3.finish([0, 1])
      const game4 = new Glicko2Game([playerA, playerB], undefined, true)
      game4.finish([1, 0])

      updatePlayerStats()
      expect(playerA.rating.value).toBeCloseTo(playerB.rating.value)
   })

   const random = new Glicko2Bot(null, new Version(1, 0, 0))
   const plusPtOne = new Glicko2Bot(null, new Version(1, 0, 0))
   const plusPtTwo = new Glicko2Bot(null, new Version(1, 0, 0))

   test('random < plusPtOne < plusPtTwo', () => {
      for (let i = 0; i < 100; i++) {
         const game5thru104 = new Glicko2Game([random, plusPtOne, plusPtTwo], undefined, true)
         const scores = [Math.random(), Math.random() + 0.1, Math.random() + 0.2] as const
         const total = scores[0] + scores[1] + scores[2]
         // @ts-expect-error seriously?
         game5thru104.finish(scores.map(score => score / total) as readonly [number, number, number])
         updatePlayerStats()
      }

      console.info({
         random: random.rating.value,
         plusPtOne: plusPtOne.rating.value,
         plusPtTwo: plusPtTwo.rating.value,
         RD: (plusPtOne.rating.deviation + plusPtTwo.rating.deviation) / 2
      })

      expect(random.rating.value).toBeLessThan(plusPtOne.rating.value)
      expect(plusPtOne.rating.value).toBeLessThan(plusPtTwo.rating.value)
   })
})
