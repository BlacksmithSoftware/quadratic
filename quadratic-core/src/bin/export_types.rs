use quadratic_core::{controller::transactions, *};
use ts_rs::TS;

macro_rules! generate_type_declarations {
    ($($type:ty),+ $(,)?) => {
        String::new() $(+ "export " + &<$type>::decl() + "\n")+
    };
}

fn main() {
    // TODO: autogenerate this file by parsing the whole project using `syn` and
    // searching for types annotated with `#[derive(TS)]`. This still won't work
    // for types generated by `macro_rules!` macros, so we'll have to handle
    // those some other way.
    let mut s = format!("// This file is automatically generated by {}\n", file!());
    s += "// Do not modify it manually.\n\n";

    s += &generate_type_declarations!(
        transactions::TransactionSummary,
        formulas::RangeRef,
        formulas::CellRef,
        formulas::CellRefCoord,
        grid::CellBorders,
        grid::CellBorderStyle,
        grid::CellBorder,
        grid::GridBounds,
        grid::CodeCellLanguage,
        // grid::CodeCellValue,
        grid::CodeCellRunOutput,
        grid::CodeCellRunResult,
        // grid::CellAlign,
        // grid::CellWrap,
        // grid::NumericFormat,
        // grid::NumericFormatKind,
        // grid::BoolSummary,
        // grid::SheetId,
        // grid::RowId,
        // grid::ColumnId,
        // grid::CellRef,
        // grid::js_types::JsRenderCell,
        // grid::js_types::JsRenderFill,
        // grid::js_types::JsRenderBorder,
        // grid::js_types::FormattingSummary,
        // grid::js_types::CellFormatSummary,
        // grid::js_types::JsRenderCodeCell,
        // grid::js_types::JsRenderCodeCellState,
        // ArraySize,
        // Axis,
        // // Array,
        // // Value,
        // Instant,
        // Duration,
        // wasm_bindings::JsCodeResult,
        // wasm_bindings::JsFormulaParseResult,
        // wasm_bindings::JsCellRefSpan,
        // Error,
        // ErrorMsg,
        Pos,
        Rect,
        Span,
    );

    std::fs::write("../src/quadratic-core/types.d.ts", s).expect("failed to write types file");
}
