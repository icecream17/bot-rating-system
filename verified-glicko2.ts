// Modified version of mmai/glicko2js
// which is under the MIT License: https://github.com/mmai/glicko2js/blob/master/LICENSE.md


const scalingFactor = 173.7178;

class Race {
    matches: [Player, Player, 1 | 0.5][];
    constructor (results: Player[][]) {
        this.matches = this.computeMatches(results);
    }

    getMatches() { return this.matches; }
    computeMatches(results: Player[][]): [Player, Player, 1 | 0.5][] {
        var players: { player: Player; position: number; }[] = [];
        var position = 0;

        results.forEach(function (rank: Player[]) {
            position += 1;
            rank.forEach(function (player: Player) {
                players.push({"player": player, "position": position});
            })
        })

        function computeMatches(players: { player: Player; position: number; }[]): [Player, Player, 1 | 0.5][] {
            if (players.length === 0) return [];

            var player1 = players.shift() as { player: Player; position: number; }
            var player1_results  = players.map(player2 =>
                [player1.player, player2.player, (player1.position < player2.position) ? 1 : 0.5] as const
            ) as [Player, Player, 1 | 0.5][];

            return player1_results.concat(computeMatches(players));
        }

        return computeMatches(players)
    }
}

class Player {
    __rating!: number;
    __rd!: number;
    __vol!: number;
    _tau: number;
    _epsilon: number;
    id: number;
    adv_ranks: number[];
    adv_rds: number[];
    outcomes: number[];

    constructor (rating: number, rd: number, vol: number, tau: number, epsilon: number, public defaultRating: number, public volatility_algorithm: (v: number, delta:number) => number, id: number){
        this._tau = tau;
        this._epsilon = epsilon;

        this.setRating(rating);
        this.setRd(rd);
        this.setVol(vol);
        this.id = id;
        this.adv_ranks = [];
        this.adv_rds = [];
        this.outcomes = [];
    }

    getRating (){
        return this.__rating * scalingFactor + this.defaultRating;
    }

    setRating (rating: number){
        this.__rating = (rating - this.defaultRating) / scalingFactor;
    }

    getRd (){
        return this.__rd * scalingFactor
    }

    setRd (rd: number){
        this.__rd = rd / scalingFactor
    }

    getVol (){
        return this.__vol
    }

    setVol (vol: number){
        this.__vol = vol
    }

    addResult(opponent: Player, outcome: number){
        this.adv_ranks.push(opponent.__rating);
        this.adv_rds.push(opponent.__rd);
        this.outcomes.push(outcome);
    }


    /// Calculates the new rating and rating deviation of the player.
    /// Follows the steps of the algorithm described at http://www.glicko.net/glicko/glicko2.pdf
    update_rank() {
        if (!this.hasPlayed()){
            // Applies only the Step 6 of the algorithm
            this._preRatingRD();
            return;
        }

        //Step 1 : done by Player initialization
        //Step 2 : done by setRating and setRd

        //Step 3
        var v = this._variance();

        //Step 4
        var delta = this._delta(v);

        //Step 5
        this.__vol = this.volatility_algorithm(v, delta);

        //Step 6
        this._preRatingRD();

        //Step 7
        this.__rd = 1 / Math.sqrt((1 / Math.pow(this.__rd, 2)) + (1 / v));

        var tempSum = 0;
        for (var i=0,len = this.adv_ranks.length;i< len;i++){
            tempSum += this._g(this.adv_rds[i]) * (this.outcomes[i] - this._E(this.adv_ranks[i], this.adv_rds[i]));
        }
        this.__rating += Math.pow(this.__rd, 2) * tempSum;

        //Step 8 : done by getRating and getRd
    }

    hasPlayed (){
        return this.outcomes.length > 0;
    }

    /// Calculates and updates the player's rating deviation for the beginning of a rating period.
    /// preRatingRD() -> None
    _preRatingRD () {
        this.__rd = Math.sqrt(Math.pow(this.__rd, 2) + Math.pow(this.__vol, 2));
    }

    // Calculation of the estimated variance of the player's rating based on game outcomes
    _variance(){
        var tempSum = 0;
        for (var i = 0, len = this.adv_ranks.length;i<len;i++){
            var tempE = this._E(this.adv_ranks[i], this.adv_rds[i]);
            tempSum += Math.pow(this._g(this.adv_rds[i]), 2) * tempE * (1 - tempE);
        }
        return 1 / tempSum;
    }

    // The Glicko E function.
    _E (p2rating: number, p2RD: number){
        return 1 / (1 + Math.exp(-1 * this._g(p2RD) *  (this.__rating - p2rating)));
    }

    // The Glicko2 g(RD) function.
    _g (RD: number) {
        return 1 / Math.sqrt(1 + 3 * Math.pow(RD, 2) / Math.pow(Math.PI, 2));
    }

    // The delta function of the Glicko2 system.
    // Calculation of the estimated improvement in rating (step 4 of the algorithm)
    _delta (v: number) {
        var tempSum = 0;
        for (var i = 0, len = this.adv_ranks.length;i<len;i++){
            tempSum += this._g(this.adv_rds[i]) * (this.outcomes[i] - this._E(this.adv_ranks[i], this.adv_rds[i]));
        }
        return v * tempSum;
    }

    _makef (delta: number, v: number, a: number) {
        var pl = this;
        return function(x: number){
            return Math.exp(x) * (Math.pow(delta, 2) - Math.pow(pl.__rd, 2) - v - Math.exp(x)) / (2*Math.pow(Math.pow(pl.__rd, 2) + v + Math.exp(x), 2)) - (x - a) / Math.pow(pl._tau, 2);
        };
    }
}

//=========================  Glicko2 class =============================================
export default class Glicko2{
    private _tau: number;
    private _epsilon: number;
    private _default_rating: number;
    private _default_rd: number;
    private _default_vol: number;
    players: Player[];
    players_index: number;
    private _volatility_algorithm: ((v: number,delta: number) => number);
    constructor ({tau = 0.5, precision = 0.0000001, rating = 1500, rd = 350, vol = 0.06, volatility_algorithm = 'newprocedure'}: {tau?: number, precision?: number, rating?: number, rd?: number, vol?: number, volatility_algorithm?: keyof typeof volatility_algorithms}){
        // Internal glicko2 parameter. "Reasonable choices are between 0.3 and
        // 1.2, though the system should be tested to decide which value results
        // in greatest predictive accuracy."
        this._tau = tau

        // Internal glicko2 parameter, "epsilon" or the "convergence tolerance"
        this._epsilon = precision

        // Default rating
        this._default_rating = rating;

        // Default rating deviation (small number = good confidence on the
        // rating accuracy)
        this._default_rd = rd

        // Default volatility (expected fluctation on the player rating)
        this._default_vol = vol;

        // Default volatility calculation algorithm (step 5 of the global
        // algorithm)
        this._volatility_algorithm = volatility_algorithms[volatility_algorithm];

        this.players = [];
        this.players_index = 0;
    }

    makeRace(results: Player[][]) {
        return new Race(results)
    }

    removePlayers() {
        this.players = [];
        this.players_index = 0;
    }

    getPlayers () { return this.players; }
    cleanPreviousMatches () {
        for (var i = 0, len = this.players.length;i < len;i++){
            this.players[i].adv_ranks = [];
            this.players[i].adv_rds = [];
            this.players[i].outcomes = [];
        }
    }

    calculatePlayersRatings () {
        this.players.forEach(player => player.update_rank())
    }

/**
 * Add players and match result to be taken in account for the new rankings calculation
 * players must have ids, they are not created if it has been done already.
 * @param {Object litteral} pl1 The first player
 * @param {Object litteral} pl2 The second player
 * @param {number} outcom The outcome : 0 = defeat, 1 = victory, 0.5 = draw
 */
    addMatch (player1: {rd: number, rating: number, vol: number, id: number}, player2: {rd: number, rating: number, vol: number, id: number}, outcome: number){
      var pl1 = this._createInternalPlayer(player1.rating, player1.rd, player1.vol, player1.id);
      var pl2 = this._createInternalPlayer(player2.rating, player2.rd, player2.vol, player2.id);
      this.addResult(pl1, pl2, outcome);
      return {pl1:pl1, pl2:pl2};
    }



    makePlayer (rating?: number, rd?: number, vol?: number) {
        //We do not expose directly createInternalPlayer in order to prevent the assignation of a custom player id whose uniqueness could not be guaranteed
        return this._createInternalPlayer(rating, rd, vol);
    };

    _createInternalPlayer (rating?: number, rd?: number, vol?: number, id?: number){
        if (id === undefined){
            id = this.players_index;
            this.players_index = this.players_index + 1;
        } else {
            //We check if the player has already been created
            var candidate = this.players[id];
            if (candidate !== undefined){
                return candidate;
            }
        }
        var player = new Player(rating ?? this._default_rating, rd ?? this._default_rd, vol ?? this._default_vol, this._tau, this._epsilon, this._default_rating, this._volatility_algorithm, id);
        this.players[id] = player;
        return player;
    };

  /**
   * Add a match result to be taken in account for the new rankings calculation
   * @param {Player} player1 The first player
   * @param {Player} player2 The second player
   * @param {number} outcome The outcome : 0 = defeat, 1 = victory, 0.5 = draw
   */
    addResult(player1: Player, player2: Player, outcome: number){
        player1.addResult(player2, outcome);
        player2.addResult(player1, 1 - outcome);
    }

    updateRatings(matches?: [Player, Player, number][]) {
        if(matches instanceof Race){
            matches = matches.getMatches();
        }
        if (typeof(matches) !== 'undefined'){
            this.cleanPreviousMatches();
            for (var i=0, len = matches.length;i<len;i++){
                var match = matches[i];
                this.addResult(match[0], match[1], match[2]);
            }
        }
        this.calculatePlayersRatings();
    }
}


//============== VOLATILITY ALGORITHMS (Step 5 of the global glicko2 algorithm)
var volatility_algorithms = {
    oldprocedure: function(this: Player, v: number, delta: number) {
        var sigma = this.__vol;
        var phi = this.__rd;
        var tau = this._tau;

        var a, x1, x2, x3, y1, y2, y3, upper;
        var result;

        upper = find_upper_falsep(phi, v, delta, tau);

        a = Math.log(Math.pow(sigma, 2));
        y1 = equation(phi, v, 0, a, tau, delta);
        if (y1 > 0 ){
            result = upper;
        } else {
            x1 = 0;
            x2 = x1;
            y2 = y1;
            x1 = x1 - 1;
            y1 = equation(phi, v, x1, a, tau, delta);
            while (y1 < 0){
                x2 = x1;
                y2 = y1;
                x1 = x1 - 1;
                y1 = equation(phi, v, x1, a, tau, delta);
            }
            for (var i = 0; i<21; i++){
                x3 = y1 * (x1 - x2) / (y2 - y1) + x1;
                y3 = equation(phi, v, x3, a, tau, delta);
                if (y3 > 0 ){
                    x1 = x3;
                    y1 = y3;
                } else {
                    x2 = x3;
                    y2 = y3;
                }
            }
            if (Math.exp((y1 * (x1 - x2) / (y2 - y1) + x1) / 2) > upper ){
                result = upper;
            } else {
                result = Math.exp((y1 * (x1 - x2) / (y2 - y1) + x1) / 2);
            }
        }
        return result;

        // //
        // function new_sigma(sigma , phi , v , delta , tau ) {
        //     var a = Math.log(Math.pow(sigma, 2));
        //     var x = a;
        //     var old_x = 0;
        //     while (x != old_x){
        //         old_x = x;
        //         var d = Math.pow(phi, 2) + v + Math.exp(old_x);
        //         var h1 = -(old_x - a) / Math.pow(tau, 2) - 0.5 * Math.exp(old_x) / d + 0.5 * Math.exp(old_x) * Math.pow((delta / d), 2);
        //         var h2 = -1 / Math.pow(tau, 2) - 0.5 * Math.exp(old_x) * (Math.pow(phi, 2) + v) / Math.pow(d, 2) + 0.5 * Math.pow(delta, 2) * Math.exp(old_x) * (Math.pow(phi, 2) + v - Math.exp(old_x)) / Math.pow(d, 3);
        //         x = old_x - h1 / h2;
        //     }
        //     return  Math.exp(x / 2);
        // }

        function equation(phi: number, v: number , x: number, a: number, tau: number, delta: number) {
            var d = Math.pow(phi, 2) + v + Math.exp(x);
            return -(x - a) / Math.pow(tau, 2) - 0.5 * Math.exp(x) / d + 0.5 * Math.exp(x) * Math.pow((delta / d), 2);
        }

        // function new_sigma_bisection(sigma , phi , v , delta , tau ) {
        //     var a, x1, x2, x3;
        //     a = Math.log(Math.pow(sigma, 2));
        //     if (equation(phi, v, 0, a, tau, delta) < 0 ){
        //         x1 = -1;
        //         while (equation(phi, v, x1, a, tau, delta) < 0){
        //             x1 = x1 - 1;
        //         }
        //         x2 = x1 + 1;
        //     } else {
        //         x2 = 1;
        //         while (equation(phi, v, x2, a, tau, delta) > 0){
        //             x2 = x2 + 1;
        //         }
        //         x1 = x2 - 1;
        //     }

        //     for (var i = 0; i < 27; i++) {
        //         x3 = (x1 + x2) / 2;
        //         if (equation(phi, v, x3, a, tau, delta) > 0 ){
        //             x1 = x3;
        //         } else {
        //             x2 = x3;
        //         }
        //     }
        //     return  Math.exp((x1 + x2)/ 4);
        // }

        function Dequation(phi: number , v: number , x: number , tau: number , delta: number) {
            const d = Math.pow(phi, 2) + v + Math.exp(x);
            return -1 / Math.pow(tau, 2) - 0.5 * Math.exp(x) / d + 0.5 * Math.exp(x) * (Math.exp(x) + Math.pow(delta, 2)) / Math.pow(d, 2) - Math.pow(Math.exp(x), 2) * Math.pow(delta, 2) / Math.pow(d, 3);
        }

        function find_upper_falsep(phi: number , v: number , delta: number , tau: number) {
            var x1, x2, x3, y1, y2, y3;
            y1 = Dequation(phi, v, 0, tau, delta);
            if (y1 < 0 ){
                return 1;
            } else {
                x1 = 0;
                x2 = x1;
                y2 = y1;
                x1 = x1 - 1;
                y1 = Dequation(phi, v, x1, tau, delta);
                while (y1 > 0){
                    x2 = x1;
                    y2 = y1;
                    x1 = x1 - 1;
                    y1 = Dequation(phi, v, x1, tau, delta);
                }
                for (var i = 0; i < 21 ; i++){
                    x3 = y1 * (x1 - x2) / (y2 - y1) + x1;
                    y3 = Dequation(phi, v, x3, tau, delta);
                    if (y3 > 0 ){
                        x1 = x3;
                        y1 = y3;
                    } else {
                        x2 = x3;
                        y2 = y3;
                    }
                }
                return Math.exp((y1 * (x1 - x2) / (y2 - y1) + x1) / 2);
            }
        }
    },
    newprocedure: function(this: Player, v: number, delta: number){
        //Step 5.1
        var A = Math.log(Math.pow(this.__vol, 2));
        var f = this._makef(delta, v, A);

        //Step 5.2
        var B, k;
        if (Math.pow(delta, 2) >  Math.pow(this.__rd, 2) + v){
            B = Math.log(Math.pow(delta, 2) -  Math.pow(this.__rd, 2) - v);
        } else {
            k = 1;
            while (f(A - k * this._tau) < 0){
                k = k + 1;
            }
            B = A - k * this._tau;
        }

        //Step 5.3
        var fA = f(A);
        var fB = f(B);

        //Step 5.4
        var C, fC;
        while (Math.abs(B - A) > this._epsilon){
            C = A + (A - B) * fA /(fB - fA );
            fC = f(C);
            if (fC * fB < 0){
                A = B;
                fA = fB;
            } else {
                fA = fA / 2;
            }
            B = C;
            fB = fC;
        }
        //Step 5.5
        return Math.exp(A/2);
    },
    newprocedure_mod: function(this: Player, v: number, delta: number){
        //Step 5.1
        var A = Math.log(Math.pow(this.__vol, 2));
        var f = this._makef(delta, v, A);

        //Step 5.2
        var B, k;
        //XXX mod
        if (delta >  Math.pow(this.__rd, 2) + v){
            //XXX mod
            B = Math.log(delta -  Math.pow(this.__rd, 2) - v);
        } else {
            k = 1;
            while (f(A - k * this._tau) < 0){
                k = k + 1;
            }
            B = A - k * this._tau;
        }

        //Step 5.3
        var fA = f(A);
        var fB = f(B);

        //Step 5.4
        var C, fC;
        while (Math.abs(B - A) > this._epsilon){
            C = A + (A - B) * fA /(fB - fA );
            fC = f(C);
            if (fC * fB < 0){
                A = B;
                fA = fB;
            } else {
                fA = fA / 2;
            }
            B = C;
            fB = fC;
        }
        //Step 5.5
        return Math.exp(A/2);
    },
    oldprocedure_simple: function(this: Player, v: number, delta: number){
        var i = 0;
        var a = Math.log(Math.pow(this.__vol, 2));
        var tau = this._tau;
        var x0 = a;
        var x1 = 0;
        var d,h1,h2;

        while (Math.abs(x0 - x1) > this._epsilon){
            // New iteration, so x(i) becomes x(i-1)
            x0 = x1;
            d = Math.pow(this.__rating, 2) + v + Math.exp(x0);
            h1 = -(x0 - a) / Math.pow(tau, 2) - 0.5 * Math.exp(x0) / d + 0.5 * Math.exp(x0) * Math.pow(delta / d, 2);
            h2 = -1 / Math.pow(tau, 2) - 0.5 * Math.exp(x0) * (Math.pow(this.__rating, 2) + v) / Math.pow(d, 2) + 0.5 * Math.pow(delta, 2) * Math.exp(x0) * (Math.pow(this.__rating, 2) + v - Math.exp(x0)) / Math.pow(d, 3);
            x1 = x0 - (h1 / h2);
        }

        return Math.exp(x1 / 2);
    }
};
//==== End of volatility algorithms
