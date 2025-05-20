import { CLICommands, type CLICommandEntry } from "./commands.types";
import {
  longCommand,
  printMarketOrderHelp,
  shortCommand,
} from "./market.command";
import {
  closePositionCommand,
  closePositionHelp,
  increasePositionCommand,
  printManagePositionHelp,
  reducePositionCommand,
} from "./position.command";

export const DEFAULT_CLI_COMMANDS: CLICommandEntry[] = [
  {
    method: CLICommands.Long,
    alias: CLICommands.LongAlias,
    description: "Execute a long/buy order",
    help: printMarketOrderHelp(CLICommands.Long),
    command: longCommand,
  },
  {
    method: CLICommands.Short,
    alias: CLICommands.ShortAlias,
    description: "Execute a short/sell order",
    help: printMarketOrderHelp(CLICommands.Short),
    command: shortCommand,
  },
  {
    method: CLICommands.Close,
    description: "Close a position",
    help: closePositionHelp,
    command: closePositionCommand,
  },
  {
    method: CLICommands.Increase,
    description: "Increase a position",
    help: printManagePositionHelp("increase"),
    command: increasePositionCommand,
  },
  {
    method: CLICommands.Reduce,
    description: "Reduce a position",
    help: printManagePositionHelp("reduce"),
    command: reducePositionCommand,
  },
];
