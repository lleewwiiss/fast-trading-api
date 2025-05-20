import type { FastTradingApi } from "../fast-trading-api.lib";

export enum CLIMessageSeverity {
  Warning = "warning",
  Error = "error",
  Info = "info",
}

export interface CLIParsedCommandArgs {
  value: string;
  method: string;
  isSubMethodHelp: boolean;
  args: string[];
}

export interface CLICommandArgs {
  api: FastTradingApi;
  args: string[];
  onMessage: (message: string, severity: CLIMessageSeverity) => void;
}

export interface CLICommandEntry {
  method: string;
  description?: string;
  alias?: string;
  help?: string;
  command: (cmd: CLICommandArgs) => Promise<void> | void;
}

export enum CLICommands {
  Help = "help",
  HelpAlias = "h",
  Long = "long",
  LongAlias = "l",
  Short = "short",
  ShortAlias = "s",
  Close = "close",
}
