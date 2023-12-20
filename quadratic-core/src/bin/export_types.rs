use std::fs::create_dir_all;

use quadratic_core::{
    controller::transaction_summary::{CellSheetsModified, TransactionSummary},
    grid::js_types::JsHtmlOutput,
    *,
};
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
        TransactionSummary,
        CellSheetsModified,
        JsHtmlOutput,
        formulas::RangeRef,
        formulas::CellRef,
        formulas::CellRefCoord,
        grid::GridBounds,
        grid::CellAlign,
        grid::CellWrap,
        grid::NumericFormat,
        grid::NumericFormatKind,
        grid::BoolSummary,
        grid::SheetId,
        grid::js_types::JsRenderCell,
        grid::js_types::JsRenderFill,
        grid::js_types::FormattingSummary,
        grid::js_types::CellFormatSummary,
        grid::js_types::JsClipboard,
        // values
        ArraySize,
        Axis,
        // Array,
        // Value,
        Instant,
        Duration,
        Error,
        ErrorMsg,
        Pos,
        Rect,
        Span,
    );

    if create_dir_all("../quadratic-client/src/quadratic-core").is_ok() {
        std::fs::write("../quadratic-client/src/quadratic-core/types.d.ts", s)
            .expect("failed to write types file");
    }
}
