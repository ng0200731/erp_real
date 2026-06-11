package com.erpnlr.orderscanner.models

import com.google.gson.annotations.SerializedName

data class QuotationQrResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("quotation") val quotation: QuotationDetail?,
    @SerializedName("history") val history: List<StatusHistoryEntry>?,
    @SerializedName("suppliers") val suppliers: List<SupplierInfo>?
)

data class QuotationDetail(
    @SerializedName("id") val id: Int,
    @SerializedName("quotationSeq") val quotationSeq: String?,
    @SerializedName("outsourcingSeq") val outsourcingSeq: String?,
    @SerializedName("customerName") val customerName: String?,
    @SerializedName("contactPerson") val contactPerson: String?,
    @SerializedName("email") val email: String?,
    @SerializedName("phone") val phone: String?,
    @SerializedName("customerItemName") val customerItemName: String?,
    @SerializedName("productType") val productType: String?,
    @SerializedName("quantity") val quantity: Int?,
    @SerializedName("total") val total: Double?,
    @SerializedName("type") val type: String?,
    @SerializedName("status") val status: String?,
    @SerializedName("dateCreated") val dateCreated: String?,
    @SerializedName("sampleReadyDate") val sampleReadyDate: String?,
    @SerializedName("brandId") val brandId: Int?,
    @SerializedName("profileImageUrl") val profileImageUrl: String?
)

data class StatusHistoryEntry(
    @SerializedName("id") val id: Int,
    @SerializedName("fromStatus") val fromStatus: String?,
    @SerializedName("toStatus") val toStatus: String?,
    @SerializedName("changedAt") val changedAt: String?,
    @SerializedName("note") val note: String?
)

data class SupplierInfo(
    @SerializedName("id") val id: Int?,
    @SerializedName("companyName") val companyName: String?,
    @SerializedName("emailDomain") val emailDomain: String?,
    @SerializedName("members") val members: List<SupplierMember>?
)

data class SupplierMember(
    @SerializedName("name") val name: String?,
    @SerializedName("emailPrefix") val emailPrefix: String?
)
