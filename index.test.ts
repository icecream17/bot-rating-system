
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

import { Defaults, Player, Bot, Rating, Version, Game, Result } from './index'

describe('Defaults', () => {
   test('Values which cannot be changed', () => {
      expect(Defaults.glicko2ScaleFactor).toBe(173.7178)
      expect(Defaults.ratingInterval).toBe(400)
      expect(Defaults.ratingValue).toBe(1500)
      expect(Defaults.ratingDeviation).toBe(350)
   })

   test('Not totally wrong', () => {
      expect(Defaults.ratingVolatility).toBeGreaterThan(0)
      expect(Defaults.ratingVolatility).toBeLessThan(1000)
      expect(Defaults.systemTau).toBeGreaterThanOrEqual(0)
      expect(Defaults.systemTau).toBeLessThan(5)
      // expect(Defaults.systemRatingPeriodLength).toBeGreaterThan(0)
      // expect(Defaults.systemRatingPeriodLength).not.toBe(Infinity)
      expect(Defaults.convergenceTolerance).toBeGreaterThanOrEqual(0)
      expect(Defaults.convergenceTolerance).toBeLessThanOrEqual(0.000001)
   })
})

describe('System', () => {
   const playerA = new Bot(false)
   const playerB = new Bot(false)

   test('New players have a rating', () => {
      expect(playerA.rating).toBeInstanceOf(Rating)
      expect(playerB.rating).toBeInstanceOf(Rating)
   })

   test('Different players have different ids', () => {
      expect(playerA.id).not.toBe(playerB.id)
   })

   test('If A vs B and A wins, A.rating > B.rating', () => {
      const game1 = new Game([playerA, playerB], undefined, true)
      game1.finish({
         [playerA.id]: 1,
         [playerB.id]: 0,
      })

      expect(playerA.rating.value).toBeGreaterThan(playerB.rating.value)
   })

   test('After A wins once, if B wins twice, B.rating > A.rating', () => {
      const game2 = new Game([playerA, playerB], undefined, true)
      game2.finish({
         [playerA.id]: 0,
         [playerB.id]: 1,
      })

      const game3 = new Game([playerA, playerB], undefined, true)
      game3.finish({
         [playerA.id]: 0,
         [playerB.id]: 1,
      })

      expect(playerB.rating.value).toBeGreaterThan(playerA.rating.value)
   })

   test('After ABBA, A.rating === B.rating', () => {
      const game4 = new Game([playerA, playerB], undefined, true)
      game4.finish({
         [playerA.id]: 1,
         [playerB.id]: 0,
      })

      expect(playerA.rating.value).toBeCloseTo(playerB.rating.value)
   })

   const random = new Bot(false, null, new Version(1, 0, 0))
   const plusPtOne = new Bot(false, null, new Version(1, 0, 0))
   const plusPtTwo = new Bot(false, null, new Version(1, 0, 0))

   test('random < plusPtOne < plusPtTwo', () => {
      for (let i = 0; i < 100; i++) {
         const game5thru104 = new Game([random, plusPtOne, plusPtTwo], undefined, true)
         const scores = [Math.random(), Math.random() + 0.1, Math.random() + 0.2] as const
         const total = scores[0] + scores[1] + scores[2]
         game5thru104.finish({
            [random.id]: scores[0] / total,
            [plusPtOne.id]: scores[1] / total,
            [plusPtTwo.id]: scores[2] / total,
         })
      }

      console.info({
         random: random.rating.value,
         plusPtOne: plusPtOne.rating.value,
         plusPtTwo: plusPtTwo.rating.value,
      })

      expect(random.rating.value).toBeLessThan(plusPtOne.rating.value)
      expect(plusPtOne.rating.value).toBeLessThan(plusPtTwo.rating.value)
   })
})
