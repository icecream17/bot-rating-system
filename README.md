# bot-rating-system

A rating system with various optimizations for deterministic players

This is a modified version of Glicko-2

## Example optimization

If A plays against B, and A is deterministic, and B is deterministic, and the game is deterministic, and the players are in the same order or the order doesn't matter, the results will always the the same.

So there's no need for multiple games to get slowly and slowly more accurate.

I'm not sure if Glicko-2 is guaranteed to converge with infinite games, but it's very likely.

## The difference between changeRating(one game) + changeRating(one game) vs changeRating(two games)

Say `playerA`, `playerB`, and `playerC` all have 0 games. By default they have 1500 rating.

The results are in: `playerA` wins against `playerB`, `playerB` wins against `playerC`, `playerC` wins against `playerA`.

Obviously everyone still has 1500 rating, right?

Say a player's rating = `oldRating + (result - expected)(oppRating)`, where expected = `oldRating / (oldRating + oppRating)`

```txt
playerA (1500) wins against playerB (1500), expected 0.5, new ratings {2250, 750}
playerB (750) wins against playerC (1500), expected 1/3, new ratings {1750, 500}
playerC (500) wins against playerA (2250), expected 2/9, new ratings {2250, 500}

New ratings: {500, 1750, 2250}
```

There's too much compensation here let's reduce the compensation by 50%

```txt
playerA (1500) wins against playerB (1500), expected 0.5, new ratings {1875, 1125}
playerB (1125) wins against playerC (1500), expected 3/7, new ratings {1553 + 4/7, 1071 + 3/7}
playerC ~1071) wins against playerA (1875), expected 4/11, new ratings {1667 + 3/7 + 13/22, 1278 + 4/11}

New ratings: {1553 + 4/7, 1278 + 4/11, 1667 + 3/7 + 13/22}
```

No matter what, it seems like _more recent games are valued more than less recent games_, and that _when playerC wins against playerA, playerB's win wasn't adjusted_

So that's kinda solved by grouping similarly timed games, so that they're treated as equivalent, and so that what we're actually scoring is:

```txt
playerA (1500) wins against playerB (1500) and loses to playerC (1500) --> 1500
```

instead of

```txt
playerA (1500) wins against playerB (1500)
```

But ultimately even those rating groups are inaccurate with deterministic bots that always stay the same.

When there are only games with players that never change (looser than deterministic!), time, or the order in which games happen, doesn't matter.

So you could treat every single game as a single rating period in Glicko-2!

But I wonder if there's a way to simplify... if there's both non-changing and changing players.
