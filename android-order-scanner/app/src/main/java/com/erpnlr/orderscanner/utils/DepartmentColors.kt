package com.erpnlr.orderscanner.utils

object DepartmentColors {
    private val colorMap = mapOf(
        "CS Team" to "#FF6B6B",
        "PMC" to "#4ECDC4",
        "Material" to "#45B7D1",
        "Production" to "#FFA07A",
        "Cut and Fold" to "#98D8C8",
        "QC" to "#F7DC6F",
        "Shipment" to "#BB8FCE",
        "Account" to "#85C1E2"
    )

    fun getColor(department: String): String {
        return colorMap[department] ?: "#999999"
    }
}
