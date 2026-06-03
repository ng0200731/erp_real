package com.erpnlr.orderscanner.models

import com.google.gson.annotations.SerializedName

data class OrderDetailResponse(
    @SerializedName("success")
    val success: Boolean,
    @SerializedName("order")
    val order: OrderDetail?
)

data class OrderDetail(
    @SerializedName("orderSeq")
    val orderSeq: String,
    @SerializedName("quotationSeq")
    val quotationSeq: String?,
    @SerializedName("customerName")
    val customerName: String,
    @SerializedName("contactPerson")
    val contactPerson: String?,
    @SerializedName("customerItemName")
    val customerItemName: String?,
    @SerializedName("productType")
    val productType: String,
    @SerializedName("quantity")
    val quantity: Int,
    @SerializedName("unitPrice")
    val unitPrice: Double,
    @SerializedName("total")
    val total: Double,
    @SerializedName("workshopName")
    val workshopName: String?,
    @SerializedName("country")
    val country: String?,
    @SerializedName("currentDepartment")
    val currentDepartment: String?,
    @SerializedName("status")
    val status: String,
    @SerializedName("progressHistory")
    val progressHistory: List<ProgressScan>?
)
