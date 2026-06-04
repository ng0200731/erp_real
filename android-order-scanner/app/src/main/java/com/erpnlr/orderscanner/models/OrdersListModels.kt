package com.erpnlr.orderscanner.models

import com.google.gson.annotations.SerializedName

data class OrdersListResponse(
    @SerializedName("success")
    val success: Boolean,
    @SerializedName("orders")
    val orders: List<OrderListItem>
)

data class OrderListItem(
    @SerializedName("id")
    val id: Int,
    @SerializedName("orderSeq")
    val orderSeq: String,
    @SerializedName("quotationSeq")
    val quotationSeq: String?,
    @SerializedName("quotationId")
    val quotationId: Int?,
    @SerializedName("customerName")
    val customerName: String,
    @SerializedName("customerItemName")
    val customerItemName: String?,
    @SerializedName("productType")
    val productType: String,
    @SerializedName("quantity")
    val quantity: Int,
    @SerializedName("workshopName")
    val workshopName: String?,
    @SerializedName("status")
    val status: String,
    @SerializedName("currentDepartment")
    val currentDepartment: String?,
    @SerializedName("dateCreated")
    val dateCreated: String
)

data class BulkCancelRequest(
    @SerializedName("orderIds")
    val orderIds: List<Int>
)

data class BulkCancelResponse(
    @SerializedName("success")
    val success: Boolean,
    @SerializedName("updatedCount")
    val updatedCount: Int,
    @SerializedName("error")
    val error: String?
)

data class BulkScanUpdateRequest(
    @SerializedName("orderIds")
    val orderIds: List<Int>,
    @SerializedName("department")
    val department: String
)

data class BulkScanUpdateResponse(
    @SerializedName("success")
    val success: Boolean,
    @SerializedName("updatedCount")
    val updatedCount: Int,
    @SerializedName("results")
    val results: List<BulkScanResult>?,
    @SerializedName("errors")
    val errors: List<BulkScanError>?,
    @SerializedName("error")
    val error: String?
)

data class BulkScanResult(
    @SerializedName("orderId")
    val orderId: Int,
    @SerializedName("orderSeq")
    val orderSeq: String,
    @SerializedName("department")
    val department: String
)

data class BulkScanError(
    @SerializedName("orderId")
    val orderId: Int?,
    @SerializedName("orderSeq")
    val orderSeq: String?,
    @SerializedName("error")
    val error: String
)

data class BulkQrData(
    @SerializedName("type")
    val type: String?,
    @SerializedName("poNumbers")
    val poNumbers: List<String>?,
    @SerializedName("count")
    val count: Int?
)
