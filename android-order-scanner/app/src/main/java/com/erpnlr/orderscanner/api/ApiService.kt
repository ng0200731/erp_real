package com.erpnlr.orderscanner.api

import com.erpnlr.orderscanner.models.ScanRequest
import com.erpnlr.orderscanner.models.ScanResponse
import com.erpnlr.orderscanner.models.LastScanResponse
import com.erpnlr.orderscanner.models.ProgressHistoryResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface ApiService {
    @POST("api/orders/progress/scan")
    suspend fun recordScan(@Body request: ScanRequest): Response<ScanResponse>

    @GET("api/orders/progress/{orderSeq}/last")
    suspend fun getLastScan(@Path("orderSeq") orderSeq: String): Response<LastScanResponse>

    @GET("api/orders/progress/{orderSeq}")
    suspend fun getProgressHistory(@Path("orderSeq") orderSeq: String): Response<ProgressHistoryResponse>
}
