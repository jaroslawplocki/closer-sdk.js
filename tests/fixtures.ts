import { Config, load } from "../src/config";
import * as logger from "../src/logger";

export const log = logger.devNull;

export const config: Config = load({
    url: "localhost:5431",
    debug: true
} as Config);