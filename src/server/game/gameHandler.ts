import chalk from "chalk";

import { randomTeam, generateSolution } from "./solutionProvider";
import { getWords } from "./wordProvider";
import { createLogger } from "./gameLogger";
import * as util from "./gameUtility";

import { Card, GamePhase, GameState, Hint, Player, TeamColour } from "../../shared/codenames";

const gameDefaults = {
    totalCardAmount: 25,
    cardsPerTeam: 7,
    assassins: 1
};

/**
 * Provides an interface to perform actions on a game state, using a specified acting player.
 */
interface GameHandler {
    /**
     * Switches the acting player from the current team to a new one.
     */
    switchTeam: (team: TeamColour) => void;
    /**
     * Starts a new round.
     */
    startRound: () => void;
    /**
     * Submits a hint to the round.
     */
    submitHint: (hint: Hint) => void;
    /**
     * Reveals the card at the specified index. Also advances the game progress, if needed.
     */
    revealCard: (index: number) => void;
    /**
     * Passes the turn to the next team.
     */
    advanceTurn: () => void;
    /**
     * Ends the game, using a specified winner.
     */
    endGame: (winner: TeamColour) => void;
}

export function createGameHandler(caller: Player, game: GameState): GameHandler {
    const logger = createLogger(game);
    return {
        switchTeam: function(team: TeamColour) {
            if (!util.isProperTeam(team)) {
                throw new Error(`Couleur d'équipe incorrecte '${team}'.`);
            }

            caller.team = team;
            logger.info(`${caller} changé d'équipe ${util.formatTeamName(team)}.`);
        },
        startRound: function() {
            game.round++;
            game.phase = GamePhase.Round;
            game.hint = null;
            game.hintHistory = [];
            
            const setGameMaster = (team: TeamColour) => {
                util.getTeamPlayers(game.players, team).forEach((player, index, array) => {
                    player.isGameMaster = index == (game.round % array.length);
                });
            }
            setGameMaster(TeamColour.Red);
            setGameMaster(TeamColour.Blue);
            
            let startingTeam = randomTeam();
            let words = getWords(game.language, gameDefaults.totalCardAmount, game.cards != undefined ? game.cards.map(c => c.content) : undefined);
            let solutions = generateSolution(gameDefaults.totalCardAmount, gameDefaults.cardsPerTeam, gameDefaults.assassins, startingTeam);

            game.cards = words.map((word: string, index: number) => <Card>{ content: word, colour: solutions[index] });
            game.inTurn = startingTeam;

            logger.info(`${caller} a commencé un nouveau tour !`);
        },
        submitHint: function(hint: Hint) {
            game.hint = hint;
            game.hintHistory.push(hint);
            
            logger.info(`${caller} a soumis un indice : ${chalk.yellow(JSON.stringify(hint))}`);
        },
        revealCard: function(index: number) {
            if (game.cards == undefined) {
                throw new Error("Une tentative de révéler une carte a été faite, mais aucune carte n'a encore été créée.");
            }

            logger.info(`${caller} a révélé la carte ${index} (${game.cards[index].content}).`);

            const card = game.cards[index];
            card.isConsumed = true;

            if (card.colour === TeamColour.Black) {
                this.endGame(util.otherTeam(caller.team));
                logger.info(chalk.red`   --> Card était un assassin. Équipe ${util.formatTeamName(caller.team)} a perdu.`);
            }
            else if (caller.team !== card.colour) {
                let otherTeam = util.otherTeam(caller.team);
                if (card.colour === otherTeam && game.cards.filter(c => c.colour === otherTeam).every(c => c.isConsumed)) {
                    this.endGame(otherTeam);
                    logger.info(chalk.red`   --> La carte n'était pas ${util.formatTeamName(caller.team)}, c'était la dernière carte de l'autre équipe. Ils ont gagné !`);
                }
                else {
                    this.advanceTurn();
                    logger.info(chalk.red`   --> La carte n'était pas ${util.formatTeamName(caller.team)}. Passage à l'autre équipe.`);
                }
            }
            else {
                if (game.cards.filter(c => c.colour === caller.team).every(c => c.isConsumed)) {
                    this.endGame(caller.team);
                    logger.info(chalk.green`   --> Équipe ${util.formatTeamName(caller.team)} a gagné en révélant toutes ses cartes !`);
                }
                else {
                    logger.info(chalk.green`   --> La carte était de la même couleur (${util.formatTeamName(caller.team)}), continue à deviner !`);
                }
            }
        },
        advanceTurn: function() {
            game.hint = null;
            game.inTurn = util.otherTeam(game.inTurn);
        },
        endGame: function(winner: TeamColour) {
            game.phase = GamePhase.Over;
            game.winnerHistory.push(winner);
        }
    };
}
