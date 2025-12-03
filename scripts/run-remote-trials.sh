#!/bin/bash

# Remote Lambda PDF Generation Trial Runner
# Runs all debug trial test cases with warmup and timing analysis

set -e

# Default values
WARMUP_ONLY=false
SKIP_WARMUP=false
WARMUP_COUNT=1
TRIAL_RUNS=3

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --WarmupOnly)
            WARMUP_ONLY=true
            shift
            ;;
        --SkipWarmup)
            SKIP_WARMUP=true
            shift
            ;;
        --WarmupCount)
            WARMUP_COUNT="$2"
            shift 2
            ;;
        --TrialRuns)
            TRIAL_RUNS="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--WarmupOnly] [--SkipWarmup] [--WarmupCount N] [--TrialRuns N]"
            exit 1
            ;;
    esac
done

# Configuration
ENDPOINT="https://urnfgdtgu6.execute-api.us-east-2.amazonaws.com/webhook/salesforce"
TIMEOUT_SEC=120

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
DARK_GRAY='\033[1;30m'
NC='\033[0m' # No Color

# Test cases from DEBUG_TRIALS.md
# Format: "ID|NAME|SCHOOL|APPLICANT|PROGRAM"
declare -a TEST_CASES=(
    "0iTHn000000YwRtMAK|IA-0000001566|TCS|Areej Khalid|PsyD Clinical Psychology"
    "0iTHn000000YwTSMA0|IA-0000001663|TCS|Emma Schmidt|PsyD Clinical Psychology"
    "0iTHn000000YwTTMA0|IA-0000001664|TCS|Maimouna Doumbia|MA Forensic Psychology"
    "0iTQU0000000znJ2AQ|IA-0000189256|KHSU|Dustin Ness|Doctor of Osteopathic Medicine"
    "0iTQU0000000zvg2AA|IA-0000189775|IllinoisCOM|David Dat Huy Huynh|Doctor of Osteopathic Medicine"
    "0iTQU0000000rid2AA|IA-0000158358|COL|Omar Reyes|Juris Doctor"
    "0iTQU0000000ufR2AQ|IA-0000169604|POC|Xiomara y Reyes|Bachelor of Social Work"
    "0iTQU0000001gIp2AI|IA-0000217624|UWS|Jamie L Kratky|MS Human Nutrition"
    "0iTHn000000Ywa6MAC|IA-0000002075|SAY|Elvira Arlene Laguna|Ph.D. Transformative Social Change"
)

# Function to invoke webhook test
invoke_webhook_test() {
    local application_id="$1"
    local label="$2"
    
    local body=$(jq -n --arg appId "$application_id" '{applicationId: $appId}')
    local start_time=$(date +%s.%N)
    
    local response
    local http_code
    local error_msg=""
    
    # Make HTTP request with curl
    response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$body" \
        --max-time "$TIMEOUT_SEC" \
        "$ENDPOINT" 2>&1) || error_msg="$response"
    
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc)
    
    if [ -n "$error_msg" ] || [ -z "$response" ]; then
        echo "{\"success\":false,\"duration\":$duration,\"contentVersionId\":null,\"isNewVersion\":null,\"error\":\"$error_msg\"}"
        return
    fi
    
    # Extract HTTP code (last line) and body (everything else)
    http_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" != "200" ]; then
        echo "{\"success\":false,\"duration\":$duration,\"contentVersionId\":null,\"isNewVersion\":null,\"error\":\"HTTP $http_code: $response_body\"}"
        return
    fi
    
    # Parse JSON response
    local success=$(echo "$response_body" | jq -r '.success // false')
    local content_version_id=$(echo "$response_body" | jq -r '.contentVersionId // empty')
    local is_new_version=$(echo "$response_body" | jq -r '.isNewVersion // false')
    
    echo "{\"success\":$success,\"duration\":$duration,\"contentVersionId\":\"$content_version_id\",\"isNewVersion\":$is_new_version,\"error\":null}"
}

# Function to write header
write_header() {
    local text="$1"
    echo ""
    echo "======================================================================" | sed 's/./=/g'
    echo -e "${CYAN}$text${NC}"
    echo "======================================================================" | sed 's/./=/g'
}

# Function to write test result
write_test_result() {
    local test_id="$1"
    local test_name="$2"
    local result_json="$3"
    local run_number="$4"
    
    local success=$(echo "$result_json" | jq -r '.success')
    local duration=$(echo "$result_json" | jq -r '.duration')
    local is_new_version=$(echo "$result_json" | jq -r '.isNewVersion')
    local error=$(echo "$result_json" | jq -r '.error // empty')
    
    local status
    local color
    if [ "$success" = "true" ]; then
        status="✅ PASS"
        color="$GREEN"
    else
        status="❌ FAIL"
        color="$RED"
    fi
    
    printf "  Run %d : " "$run_number"
    echo -ne "${color}${status}${NC}"
    printf " | %.2fs" "$duration"
    
    if [ "$is_new_version" = "true" ]; then
        echo -ne " ${YELLOW}| v+${NC}"
    fi
    
    if [ -n "$error" ] && [ "$error" != "null" ]; then
        echo -e " ${RED}| $error${NC}"
    else
        echo ""
    fi
}

# Check dependencies
if ! command -v curl &> /dev/null; then
    echo "❌ curl is not installed"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "❌ jq is not installed. Install with: brew install jq"
    exit 1
fi

if ! command -v bc &> /dev/null; then
    echo "❌ bc is not installed. Install with: brew install bc"
    exit 1
fi

# Main execution
echo ""
echo -e "${MAGENTA}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║       PDF Generation Lambda - Remote Trial Runner                    ║${NC}"
echo -e "${MAGENTA}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${DARK_GRAY}Endpoint: $ENDPOINT${NC}"
echo -e "${DARK_GRAY}Test Cases: ${#TEST_CASES[@]}${NC}"
echo -e "${DARK_GRAY}Trial Runs: $TRIAL_RUNS (after warmup)${NC}"
echo ""

declare -a all_results
start_time=$(date +%s.%N)

# Phase 1: Warmup
if [ "$SKIP_WARMUP" = false ]; then
    write_header "PHASE 1: WARMUP (Cold Start)"
    echo -e "${YELLOW}Running $WARMUP_COUNT warmup request(s) to initialize Lambda...${NC}"
    
    # Parse first test case
    IFS='|' read -r warmup_id warmup_name warmup_school warmup_applicant warmup_program <<< "${TEST_CASES[0]}"
    
    for ((w=1; w<=WARMUP_COUNT; w++)); do
        echo ""
        echo -e "${YELLOW}Warmup $w/$WARMUP_COUNT : $warmup_school - $warmup_applicant${NC}"
        
        result_json=$(invoke_webhook_test "$warmup_id" "Warmup")
        write_test_result "$warmup_id" "$warmup_name" "$result_json" "$w"
        
        all_results+=("WARMUP|$w|$warmup_id|$warmup_school|$warmup_applicant|$result_json")
    done
    
    if [ "$WARMUP_ONLY" = true ]; then
        echo ""
        echo -e "${GREEN}Warmup complete. Exiting (--WarmupOnly specified).${NC}"
        exit 0
    fi
    
    echo ""
    echo -e "${DARK_GRAY}Warmup complete. Waiting 2 seconds before trials...${NC}"
    sleep 2
fi

# Phase 2: Trial Runs
write_header "PHASE 2: TRIAL RUNS (Warm Lambda)"

declare -A trial_results

for test_case in "${TEST_CASES[@]}"; do
    IFS='|' read -r test_id test_name test_school test_applicant test_program <<< "$test_case"
    test_key="${test_school}-${test_applicant}"
    
    echo ""
    echo -e "${WHITE}Testing: $test_school - $test_applicant${NC}"
    echo -e "${DARK_GRAY}         $test_program${NC}"
    
    declare -a test_runs=()
    
    for ((run=1; run<=TRIAL_RUNS; run++)); do
        result_json=$(invoke_webhook_test "$test_id" "$test_key")
        write_test_result "$test_id" "$test_name" "$result_json" "$run"
        
        test_runs+=("$result_json")
        all_results+=("TRIAL|$run|$test_id|$test_school|$test_applicant|$result_json")
        
        # Small delay between runs to avoid throttling
        if [ $run -lt $TRIAL_RUNS ]; then
            sleep 0.5
        fi
    done
    
    # Store results for this test
    trial_results["${test_key}_runs"]="${test_runs[*]}"
    trial_results["${test_key}_school"]="$test_school"
done

# Phase 3: Analysis
write_header "PHASE 3: TIMING ANALYSIS"

end_time=$(date +%s.%N)
total_duration=$(echo "$end_time - $start_time" | bc)

# Calculate statistics for trial runs only
declare -a trial_durations=()
declare -a successful_runs=()
declare -a failed_runs=()

for result in "${all_results[@]}"; do
    IFS='|' read -r phase run_num app_id school applicant result_json <<< "$result"
    
    if [ "$phase" = "TRIAL" ]; then
        success=$(echo "$result_json" | jq -r '.success')
        duration=$(echo "$result_json" | jq -r '.duration')
        
        if [ "$success" = "true" ]; then
            successful_runs+=("$duration")
            trial_durations+=("$duration")
        else
            failed_runs+=("$result_json")
        fi
    fi
done

# Calculate statistics
avg_duration=0
min_duration=0
max_duration=0
std_dev=0

if [ ${#trial_durations[@]} -gt 0 ]; then
    # Calculate average
    sum=0
    for dur in "${trial_durations[@]}"; do
        sum=$(echo "$sum + $dur" | bc)
    done
    avg_duration=$(echo "scale=2; $sum / ${#trial_durations[@]}" | bc)
    
    # Calculate min and max
    min_duration=${trial_durations[0]}
    max_duration=${trial_durations[0]}
    for dur in "${trial_durations[@]}"; do
        if (( $(echo "$dur < $min_duration" | bc -l) )); then
            min_duration=$dur
        fi
        if (( $(echo "$dur > $max_duration" | bc -l) )); then
            max_duration=$dur
        fi
    done
    
    # Calculate standard deviation
    if [ ${#trial_durations[@]} -gt 1 ]; then
        variance_sum=0
        for dur in "${trial_durations[@]}"; do
            diff=$(echo "$dur - $avg_duration" | bc)
            squared=$(echo "$diff * $diff" | bc)
            variance_sum=$(echo "$variance_sum + $squared" | bc)
        done
        variance=$(echo "scale=2; $variance_sum / ${#trial_durations[@]}" | bc)
        std_dev=$(echo "scale=2; sqrt($variance)" | bc)
    fi
fi

echo ""
echo -e "${WHITE}Summary Statistics (Trial Runs Only)${NC}"
echo "─────────────────────────────────────"
echo "  Total Tests     : ${#TEST_CASES[@]}"
echo "  Runs per Test   : $TRIAL_RUNS"
echo "  Total Runs      : $((${#successful_runs[@]} + ${#failed_runs[@]}))"
echo -e "  Successful      : ${GREEN}${#successful_runs[@]}${NC}"
if [ ${#failed_runs[@]} -gt 0 ]; then
    echo -e "  Failed          : ${RED}${#failed_runs[@]}${NC}"
else
    echo -e "  Failed          : ${GREEN}${#failed_runs[@]}${NC}"
fi
echo ""

if [ ${#trial_durations[@]} -gt 0 ]; then
    echo -e "${WHITE}Timing (seconds)${NC}"
    echo "─────────────────────────────────────"
    printf "  Average         : %.2fs\n" "$avg_duration"
    echo -e "  Min             : ${GREEN}%.2fs${NC}" "$min_duration"
    echo -e "  Max             : ${YELLOW}%.2fs${NC}" "$max_duration"
    printf "  Std Deviation   : %.2fs\n" "$std_dev"
    echo ""
fi

# Per-school breakdown
echo -e "${WHITE}Per-School Breakdown${NC}"
echo "─────────────────────────────────────"

declare -A school_stats
for result in "${all_results[@]}"; do
    IFS='|' read -r phase run_num app_id school applicant result_json <<< "$result"
    
    if [ "$phase" = "TRIAL" ]; then
        success=$(echo "$result_json" | jq -r '.success')
        duration=$(echo "$result_json" | jq -r '.duration')
        
        if [ "$success" = "true" ]; then
            if [ -z "${school_stats[${school}_durations]}" ]; then
                school_stats[${school}_durations]="$duration"
                school_stats[${school}_count]=1
                school_stats[${school}_total]=1
            else
                school_stats[${school}_durations]="${school_stats[${school}_durations]} $duration"
                school_stats[${school}_count]=$((${school_stats[${school}_count]} + 1))
                school_stats[${school}_total]=$((${school_stats[${school}_total]} + 1))
            fi
        else
            if [ -z "${school_stats[${school}_total]}" ]; then
                school_stats[${school}_total]=1
            else
                school_stats[${school}_total]=$((${school_stats[${school}_total]} + 1))
            fi
        fi
    fi
done

# Print per-school stats
for school in TCS KHSU IllinoisCOM COL POC UWS SAY; do
    if [ -n "${school_stats[${school}_durations]}" ]; then
        durations=(${school_stats[${school}_durations]})
        sum=0
        for dur in "${durations[@]}"; do
            sum=$(echo "$sum + $dur" | bc)
        done
        avg=$(echo "scale=2; $sum / ${#durations[@]}" | bc)
        pass_count=${school_stats[${school}_count]}
        total_count=${school_stats[${school}_total]}
        printf "  %-12s : %.2fs avg | %d/%d passed\n" "$school" "$avg" "$pass_count" "$total_count"
    fi
done

echo ""
echo -e "${DARK_GRAY}Total Script Duration: %.1fs${NC}" "$total_duration"
echo ""

# Warmup comparison
if [ "$SKIP_WARMUP" = false ] && [ ${#trial_durations[@]} -gt 0 ]; then
    declare -a warmup_durations=()
    for result in "${all_results[@]}"; do
        IFS='|' read -r phase run_num app_id school applicant result_json <<< "$result"
        
        if [ "$phase" = "WARMUP" ]; then
            success=$(echo "$result_json" | jq -r '.success')
            if [ "$success" = "true" ]; then
                duration=$(echo "$result_json" | jq -r '.duration')
                warmup_durations+=("$duration")
            fi
        fi
    done
    
    if [ ${#warmup_durations[@]} -gt 0 ]; then
        warmup_sum=0
        for dur in "${warmup_durations[@]}"; do
            warmup_sum=$(echo "$warmup_sum + $dur" | bc)
        done
        warmup_avg=$(echo "scale=2; $warmup_sum / ${#warmup_durations[@]}" | bc)
        improvement=$(echo "$warmup_avg - $avg_duration" | bc)
        improvement_pct=$(echo "scale=1; ($improvement / $warmup_avg) * 100" | bc)
        
        echo -e "${WHITE}Cold vs Warm Comparison${NC}"
        echo "─────────────────────────────────────"
        echo -e "  Cold Start (Warmup) : ${YELLOW}%.2fs${NC}" "$warmup_avg"
        echo -e "  Warm Average        : ${GREEN}%.2fs${NC}" "$avg_duration"
        echo -e "  Improvement         : ${CYAN}%.2fs (%.1f%%)${NC}" "$improvement" "$improvement_pct"
        echo ""
    fi
fi

# Export results to JSON
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../typescript/application-pdf-generation/output"
mkdir -p "$OUTPUT_DIR"

timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
export_path="$OUTPUT_DIR/trial-results-$(date +%Y-%m-%d-%H%M%S).json"

# Build JSON export
json_results="["
first=true
for result in "${all_results[@]}"; do
    IFS='|' read -r phase run_num app_id school applicant result_json <<< "$result"
    
    if [ "$first" = false ]; then
        json_results+=","
    fi
    first=false
    
    success=$(echo "$result_json" | jq -r '.success')
    duration=$(echo "$result_json" | jq -r '.duration')
    error=$(echo "$result_json" | jq -r '.error // empty')
    
    json_results+=$(jq -n \
        --arg phase "$phase" \
        --arg run "$run_num" \
        --arg school "$school" \
        --arg applicant "$applicant" \
        --arg appId "$app_id" \
        --argjson success "$success" \
        --argjson duration "$duration" \
        --arg error "${error:-null}" \
        '{phase: $phase, run: ($run | tonumber), school: $school, applicant: $applicant, applicationId: $appId, success: $success, durationSeconds: $duration, error: ($error | if . == "null" then null else . end)}')
done
json_results+="]"

success_rate=0
if [ $((${#successful_runs[@]} + ${#failed_runs[@]})) -gt 0 ]; then
    success_rate=$(echo "scale=4; ${#successful_runs[@]} / $((${#successful_runs[@]} + ${#failed_runs[@]}))" | bc)
fi

export_data=$(jq -n \
    --arg timestamp "$timestamp" \
    --arg endpoint "$ENDPOINT" \
    --argjson testCases "${#TEST_CASES[@]}" \
    --argjson trialRuns "$TRIAL_RUNS" \
    --argjson results "$json_results" \
    --argjson avgDuration "$avg_duration" \
    --argjson minDuration "$min_duration" \
    --argjson maxDuration "$max_duration" \
    --argjson stdDeviation "$std_dev" \
    --argjson successRate "$success_rate" \
    '{
        timestamp: $timestamp,
        endpoint: $endpoint,
        testCases: $testCases,
        trialRuns: $trialRuns,
        results: $results,
        statistics: {
            averageDuration: $avgDuration,
            minDuration: $minDuration,
            maxDuration: $maxDuration,
            stdDeviation: $stdDeviation,
            successRate: $successRate
        }
    }')

echo "$export_data" > "$export_path"
echo -e "${DARK_GRAY}Results exported to: $export_path${NC}"
echo ""

