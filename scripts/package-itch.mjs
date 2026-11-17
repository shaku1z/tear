import { packageArguments, packageTarget } from "./package-target.mjs";

await packageTarget("itch", packageArguments("package-itch.mjs", process.argv));
