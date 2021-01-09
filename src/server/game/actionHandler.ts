import fs from "fs";
import path from "path";
import chalk from "chalk";
import { Socket } from "socket.io";

import * as games from "./gameProvider";
import * as players from "./playerProvider";
import { createLogger } from "./gameLogger";

import { GameState, Player, ClientAction } from "../../shared/codenames";

// Load the possible actions once upon module import.
const actions = loadActions();
console.log(chalk.greenBright`${chalk.white(actions.length)} action(s) ont été chargées !`);

/**
 * Represents an action that can be executed through a client request.
 */
export interface GameAction {
    /**
     * The name of the action. Used in the process of looking up which action the client wanted to invoke.
     */
    name: string;
    /**
     * Returns true if the action can, in theory, be successfully completed.
     */
    check: (caller: Player, game: GameState, data: any) => boolean;
    /**
     * Executes the action, using the specified contextual values and data.
     */
    execute: (caller: Player, game: GameState, data: any) => void;
}

/**
 * Registers the action callbacks on the given socket.
 * @param socket The socket to register the actions on.
 * @param onActionExecuted Called if an action was performed successfully, passing the modified game state.
 */
export function registerSocket(socket: Socket, onActionExecuted: (game: GameState) => void) {
    socket.on('action', (data: ClientAction) => { 
        try {
            executeAction(socket.id, data, onActionExecuted);
        }
        catch (error) {
            console.error(chalk.red(error));
        }
    });
}

/**
 * Loads the action definitions from the subdirectory '/actions'.
 */
function loadActions(): GameAction[] {
    let directory = path.join(__dirname, 'actions');
    return fs.readdirSync(directory)
        .map(file => require(path.join(directory, file)).default);
}

/**
 * Executes the given action with the specified client, using the specified data.
 * @param clientId The ID of the client that invoked the action.
 * @param clientAction The data of the action to invoke.
 * @param onActionExecuted Called if an action was performed successfully, passing the modified game state.
 */
function executeAction(clientId: string, clientAction: ClientAction, onActionExecuted: (game: GameState) => void) {
    let gameAction = actions.find(ac => ac.name == clientAction.action);
    if (gameAction == undefined) throw new Error(`Une action a été reçue sur un socket, mais l'action '${clientAction.action}' n'a pas été trouvée.`);

    let player = players.getPlayer(clientId);
    if (player == undefined) throw new Error(`Un appel d’action a été tenté, mais une instance de lecteur appelant enregistrée (${clientId}) n'a pas pu être trouvée.`);

    let game = games.getGameByPlayer(player);
    if (game == undefined) throw new Error("Un joueur appelant a été trouvé, mais l'instance de jeu correspondante n'a pas été définie.");

    const logger = createLogger(game);

    try {
        if (gameAction.check(player, game, clientAction.data)) {
            gameAction.execute(player, game, clientAction.data);
            onActionExecuted(game);
        }
        else {
            logger.error(`${player} a tenté d'exécuter l'action ${chalk.yellow(clientAction.action)}, en utilisant des données ${chalk.yellow(clientAction.data)}, mais a échoué le contrôle.`);
        }
    }
    catch (err) {
        logger.error(`Une erreur s'est produite lors de l'exécution de l'action ${chalk.yellowBright(gameAction.name)} en utilisant des données ${chalk.yellowBright(JSON.stringify(clientAction.data))}.`
            + `\r\n\t(${err})`);
    }
}
