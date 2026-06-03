package com.erpnlr.orderscanner.models

import com.google.gson.annotations.SerializedName

data class ScanRequest(
    @SerializedName("orderSeq")
    val orderSeq: String,

    @SerializedName("department")
    val department: String,

    @SerializedName("notes")
    val notes: String? = null
)

data class ScanResponse(
    @SerializedName("success")
    val success: Boolean,

    @SerializedName("message")
    val message: String,

    @SerializedName("error")
    val error: String? = null,

    @SerializedName("lastDepartment")
    val lastDepartment: String? = null,

    @SerializedName("attemptedDepartment")
    val attemptedDepartment: String? = null,

    @SerializedName("nextExpected")
    val nextExpected: String? = null
)

data class LastScan(
    @SerializedName("id")
    val id: Int,

    @SerializedName("orderSeq")
    val orderSeq: String,

    @SerializedName("department")
    val department: String,

    @SerializedName("scannedAt")
    val scannedAt: String,

    @SerializedName("notes")
    val notes: String?
)

data class LastScanResponse(
    @SerializedName("lastScan")
    val lastScan: LastScan?,

    @SerializedName("success")
    val success: Boolean
)
