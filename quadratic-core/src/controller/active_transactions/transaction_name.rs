use serde::Serialize;

#[derive(Debug, Serialize, ts_rs::TS, Clone, PartialEq)]
pub enum TransactionName {
    Unknown,
    ResizeColumn,
    ResizeRow,
    Autocomplete,
    SetBorders,
    SetCells,
    SetFormats,
    CutClipboard,
    PasteClipboard,
    SetCode,
    RunCode,
    Import,
    SetSheetMetadata,
    SheetAdd,
    SheetDelete,
    DuplicateSheet,
}
