import ts = require("typescript");
import { BuildError } from "./BuildError";
import { Options } from "./Options";
import { Compiler } from "./Compiler";
import { CodeAnalyzer } from "./CodeAnalyzer";

export class Program {

  run(): boolean {
    try {
      if(!ts.sys.args.length)
        throw new Error("Имя файла параметров не указано")

      let options = new Options(ts.sys.args[0]);
      let compiler = new Compiler(options);

      if(!compiler.preEmit())
        return false;

      if(!new CodeAnalyzer(compiler).run())
        return false;

      if(!compiler.emit())
        return false;

      return true;
    }
    catch(e) {
      this.handleError(e);
      return false;
    }
  }

  /** Пишем в выходной поток правильно сформатированную ошибку */
  private handleError(e: Error) {
    let error: BuildError;
    if(e instanceof BuildError)
      error = e;
    else
      error = new BuildError(e);
    ts.sys.write(error.toString());
  }
}


export function run() {
  return new Program().run();
}