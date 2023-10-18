// this file cannot include any imports; see https://rustwasm.github.io/wasm-bindgen/reference/js-snippets.html#caveats

export const runPython = async (
  python_code: string,
  getCells: (sheetId: string | undefined, rect: any) => string[]
): Promise<void> => {
  return await window.startPython(python_code, getCells);
};

export const transactionSummary = async (transactionSummary: any) => {
  return window.transactionSummary(transactionSummary);
};
