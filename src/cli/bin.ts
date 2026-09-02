#!/usr/bin/env node
import { cli } from "./cli.js";

process.exitCode = await cli(process.argv.slice(2));
