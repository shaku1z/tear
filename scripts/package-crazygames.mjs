import { packageArguments, packageTarget } from "./package-target.mjs";

await packageTarget("crazygames", packageArguments("package-crazygames.mjs", process.argv));
