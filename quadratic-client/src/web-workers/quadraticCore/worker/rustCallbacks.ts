// this file cannot include any imports; see https://rustwasm.github.io/wasm-bindgen/reference/js-snippets.html#caveats

declare var self: WorkerGlobalScope &
  typeof globalThis & {
    runPython: (transactionId: string, x: number, y: number, sheetId: string, code: string) => void;
    addTransaction: (transactionId: string, operations: string) => void;
    sendTransaction: (transactionId: string, operations: string) => void;
    sendProgress: (filename: string, current: number, total: number) => void;
  };

export const runPython = (transactionId: string, x: number, y: number, sheetId: string, code: string): void => {
  return self.runPython(transactionId, x, y, sheetId, code);
};

export const addUnsentTransaction = (transactionId: string, operations: string) => {
  // todo...
  // return self.addTransaction(transactionId, operations);
};

export const sendTransaction = (transactionId: string, operations: string) => {
  return self.sendTransaction(transactionId, operations);
};

export const jsTime = (name: string) => console.time(name);
export const jsTimeEnd = (name: string) => console.timeEnd(name);

export const jsProgress = (filename: string, current: number, total: number) => {
  return self.sendProgress(filename, current, total);
};
