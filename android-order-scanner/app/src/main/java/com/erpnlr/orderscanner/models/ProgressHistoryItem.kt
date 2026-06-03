package com.erpnlr.orderscanner.models

data class ProgressHistoryItem(
    val department: String,
    val scannedAt: String?,
    val notes: String?,
    val isScanned: Boolean
)
