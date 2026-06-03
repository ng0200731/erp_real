package com.erpnlr.orderscanner.models

import com.google.gson.annotations.SerializedName

data class ProgressHistoryResponse(
    val progress: List<ProgressScan>,
    val order: OrderInfo? = null
)

data class ProgressScan(
    val department: String,
    @SerializedName("scannedAt")
    val scannedAt: String,
    val notes: String?
)

data class OrderInfo(
    @SerializedName("orderSeq")
    val orderSeq: String,
    @SerializedName("quotationSeq")
    val quotationSeq: String?,
    @SerializedName("customerName")
    val customerName: String,
    @SerializedName("productType")
    val productType: String,
    @SerializedName("currentDepartment")
    val currentDepartment: String?,
    @SerializedName("status")
    val status: String
)
